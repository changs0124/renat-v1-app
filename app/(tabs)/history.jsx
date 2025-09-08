import React, { useCallback, useMemo, useState } from "react";
import { View, ScrollView } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { instance } from "apis/instance";
import { userCodeAtom } from "atom/userAtom";
import TabHeader from "components/TabHeader/TabHeader";
import {
    TextInput,
    Button,
    Card,
    Text,
    Chip,
    Divider,
    List,
    Menu,
    ActivityIndicator,
    Portal,
    Modal,
    Badge,
} from "react-native-paper";

/**
 * 요구사항 요약
 * - Cargo / Product 필터로 /historys 검색
 * - 결과 카드: 목적지, 상태(0:취소/1:진행/2:완료), 담당자, 소요시간(또는 경과), 품목/수량 등 표시
 * - 항목 탭 시 지도 모달: paths(경로) Polyline + 시작/종료 마커 렌더링
 * - 디자인: Paper 컴포넌트와 칩/아이콘/색상으로 가독성 향상
 */

/** 상태 → 레이블/아이콘/색상 매핑 */
const statusMeta = {
    0: { label: "cancel", icon: "close-circle", mode: "outlined", badge: "error" },
    1: { label: "working", icon: "progress-clock", mode: "outlined", badge: "primary" },
    2: { label: "complete", icon: "check-circle", mode: "contained", badge: "success" },
};

/** ms → "약 X시간 Y분" 형식 (분 단위 1h 이상/미만 가독성 처리) */
function formatDuration(ms) {
    if (!ms || ms < 0) return "-";
    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h > 0) return `About ${h}h ${m}m`;
    return `About ${m}m`;
}

/** 문자열 paths를 다루는 안전한 파서
 * 허용 포맷:
 *  - JSON 배열: [{lat: .., lng: ..}, ...] 또는 [{latitude:.., longitude:..}, ...]
 *  - "lat,lng;lat,lng;..." 세미콜론/줄바꿈 구분
 * 반환: [{latitude, longitude}] 배열
 */
function parsePaths(pathsStr) {
    if (!pathsStr || typeof pathsStr !== "string") return [];
    // 1) JSON 배열 시도
    try {
        const j = JSON.parse(pathsStr);
        if (Array.isArray(j)) {
            return j
                .map((p) => {
                    if (typeof p?.lat === "number" && typeof p?.lng === "number") {
                        return { latitude: p.lat, longitude: p.lng };
                    }
                    if (typeof p?.latitude === "number" && typeof p?.longitude === "number") {
                        return { latitude: p.latitude, longitude: p.longitude };
                    }
                    return null;
                })
                .filter(Boolean);
        }
    } catch (_) {
        // 통과 (다음 포맷 시도)
    }
    // 2) "lat,lng;lat,lng" or 줄바꿈 분리
    const parts = pathsStr
        .split(/[;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
    const coords = parts
        .map((token) => {
            const [latStr, lngStr] = token.split(",").map((s) => s.trim());
            const lat = Number(latStr);
            const lng = Number(lngStr);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                return { latitude: lat, longitude: lng };
            }
            return null;
        })
        .filter(Boolean);
    return coords;
}

/** 좌표 배열의 바운딩 박스로 초기 region 계산 */
function computeRegion(coords) {
    if (!coords?.length) {
        return {
            latitude: 37.5665,
            longitude: 126.9780,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
        };
    }
    let minLat = coords[0].latitude,
        maxLat = coords[0].latitude,
        minLng = coords[0].longitude,
        maxLng = coords[0].longitude;
    for (const c of coords) {
        if (c.latitude < minLat) minLat = c.latitude;
        if (c.latitude > maxLat) maxLat = c.latitude;
        if (c.longitude < minLng) minLng = c.longitude;
        if (c.longitude > maxLng) maxLng = c.longitude;
    }
    const latMid = (minLat + maxLat) / 2;
    const lngMid = (minLng + maxLng) / 2;
    const latDelta = Math.max((maxLat - minLat) * 1.4, 0.01);
    const lngDelta = Math.max((maxLng - minLng) * 1.4, 0.01);
    return { latitude: latMid, longitude: lngMid, latitudeDelta: latDelta, longitudeDelta: lngDelta };
}

/** 소요/경과 시간(ms) 계산: status=2면 endDate - startDate, 그 외는 now - startDate */
function calcElapsedMs(startDate, endDate, status) {
    const s = startDate ? new Date(startDate).getTime() : null;
    const e = endDate ? new Date(endDate).getTime() : null;
    const now = Date.now();
    if (!s) return null;
    if (status === 2 && e) return e - s; // 완료
    return now - s; // 진행중/취소시 경과로 표시(원하면 취소는 "-" 처리 가능)
}

/** 거리(km) 계산 (선택: 경로가 있으면 표시) */
function haversineDistanceKm(a, b) {
    const R = 6371;
    const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
    const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
    const lat1 = (a.latitude * Math.PI) / 180;
    const lat2 = (b.latitude * Math.PI) / 180;
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.asin(Math.sqrt(h));
    return R * c;
}
function totalPathKm(coords) {
    if (!coords || coords.length < 2) return 0;
    let sum = 0;
    for (let i = 1; i < coords.length; i++) sum += haversineDistanceKm(coords[i - 1], coords[i]);
    return Math.round(sum * 10) / 10; // 소수 1자리 반올림
}

function history() {
    const userCode = useAtomValue(userCodeAtom);

    // 필터 상태
    const [cargoId, setCargoId] = useState(null);
    const [productId, setProductId] = useState(null);
    const [cargoMenuVisible, setCargoMenuVisible] = useState(false);
    const [productMenuVisible, setProductMenuVisible] = useState(false);

    // 데이터 소스
    const cargos = useQuery({
        queryKey: ["cargos"],
        queryFn: async () => await instance.get("/cargos").then((res) => res.data),
        enabled: !!userCode,
        refetchOnWindowFocus: true,
        retry: 0,
    });

    const products = useQuery({
        queryKey: ["products"],
        queryFn: async () => await instance.get("/products").then((res) => res.data),
        enabled: !!userCode,
        refetchOnWindowFocus: true,
        retry: 0,
    });

    const topCargos = useQuery({
        queryKey: ["topCargos"],
        queryFn: async () => await instance.get("/cargos/top").then((res) => res.data),
        enabled: !!userCode,
        refetchOnWindowFocus: true,
        retry: 0,
    });

    const cargoList = Array.isArray(cargos.data) ? cargos.data : [];
    const productList = Array.isArray(products.data) ? products.data : [];
    const topCargoList = Array.isArray(topCargos.data) ? topCargos.data : [];

    const selectedCargo = useMemo(
        () => cargoList.find((c) => c.id === cargoId),
        [cargoList, cargoId]
    );
    const selectedProduct = useMemo(
        () => productList.find((p) => p.id === productId),
        [productList, productId]
    );

    // 검색 결과
    const [historyList, setHistoryList] = useState([]); // 서버에서 내려오는 배열
    const [isSearching, setIsSearching] = useState(false);

    // 지도 모달 상태
    const [mapVisible, setMapVisible] = useState(false);
    const [mapCoords, setMapCoords] = useState([]); // 현재 선택된 경로 좌표
    const [mapTitle, setMapTitle] = useState(""); // 헤더용(목적지 등)

    const handleCargoChange = useCallback((id) => {
        setCargoId(id);
        setCargoMenuVisible(false);
    }, []);

    const handleProductChange = useCallback((id) => {
        setProductId(id);
        setProductMenuVisible(false);
    }, []);

    // /historys 호출
    const getHistorys = useMutation({
        mutationFn: async () => {
            const params = {};
            if (cargoId != null && cargoId !== 0) params.cargoId = cargoId;
            if (productId != null && productId !== 0) params.productId = productId;
            return instance.get("/historys", { params }).then((res) => res?.data ?? []);
        },
        onMutate: () => setIsSearching(true),
        onSettled: () => setIsSearching(false),
        onSuccess: (res) => {
            // 기대 스키마:
            // {
            //   id: number, productCount: number, paths: string, status: 0|1|2,
            //   startDate: string, endDate?: string,
            //   CargoName: string, productName: string, userName: string
            // }
            setHistoryList(Array.isArray(res) ? res : []);
        },
    });

    const onSearch = useCallback(() => {
        getHistorys.mutateAsync().catch(() => { });
    }, [getHistorys]);

    const openMapForItem = useCallback((item) => {
        const coords = parsePaths(item?.paths);
        setMapCoords(coords);
        setMapTitle(`${item?.cargoName ?? "목적지"} · ${item?.userName ?? ""}`);
        setMapVisible(true);
    }, []);

    const closeMap = useCallback(() => {
        setMapVisible(false);
        setMapCoords([]);
        setMapTitle("");
    }, []);

    return (
        <>
            <TabHeader title={"History & Paths"} />
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                {/* 검색 필터 카드 */}
                <Card style={{ borderRadius: 16 }}>
                    <Card.Content style={{ gap: 12 }}>
                        <Text variant="labelLarge" style={{ opacity: 0.8, fontSize: 18, fontWeight: "600" }}>
                            Cargo
                        </Text>
                        <Menu
                            visible={cargoMenuVisible}
                            onDismiss={() => setCargoMenuVisible(false)}
                            anchor={
                                <Button
                                    mode="outlined"
                                    onPress={() => setCargoMenuVisible(true)}
                                    disabled={cargos.isLoading || cargos.isError}
                                    style={{ marginBottom: 4, borderRadius: 16 }}
                                    labelStyle={{ fontSize: 16, fontWeight: "600" }}
                                >
                                    {selectedCargo?.cargoName ?? "Select the Cargo"}
                                </Button>
                            }
                        >
                            {cargos.isLoading && <ActivityIndicator style={{ margin: 8 }} />}
                            {cargos.isError && <Menu.Item onPress={() => cargos.refetch()} title="Load failed (try again)" />}
                            {cargoList.map((c, idx) => (
                                <React.Fragment key={c.id}>
                                    <Menu.Item
                                        onPress={() => handleCargoChange(c.id)}
                                        title={c.cargoName ?? `Cargo #${c.id}`}
                                        titleStyle={{ opacity: 0.8, fontSize: 14, fontWeight: "600" }}
                                        style={{ paddingVertical: 4 }}
                                    />
                                    {idx < cargoList.length - 1 && <Divider />}
                                </React.Fragment>
                            ))}
                        </Menu>

                        <Text variant="labelLarge" style={{ opacity: 0.8, fontSize: 18, fontWeight: "600" }}>
                            Product
                        </Text>
                        <Menu
                            visible={productMenuVisible}
                            onDismiss={() => setProductMenuVisible(false)}
                            anchor={
                                <Button
                                    mode="outlined"
                                    onPress={() => setProductMenuVisible(true)}
                                    disabled={products.isLoading || products.isError}
                                    style={{ marginBottom: 4, borderRadius: 16 }}
                                    labelStyle={{ fontSize: 16, fontWeight: "600" }}
                                >
                                    {selectedProduct?.productName ?? "Select the Product"}
                                </Button>
                            }
                        >
                            {products.isLoading && <ActivityIndicator style={{ margin: 8 }} />}
                            {products.isError && <Menu.Item onPress={() => products.refetch()} title="Load failed (try again)" />}
                            {productList.map((p, idx) => (
                                <React.Fragment key={p.id}>
                                    <Menu.Item
                                        onPress={() => handleProductChange(p.id)}
                                        title={p.productName ?? `Product #${p.id}`}
                                        titleStyle={{ opacity: 0.8, fontSize: 14, fontWeight: "600" }}
                                        style={{ paddingVertical: 4 }}
                                    />
                                    {idx < productList.length - 1 && <Divider />}
                                </React.Fragment>
                            ))}
                        </Menu>

                        {/* Top Cargo 추천 칩 */}
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                            {topCargoList.map((cargo) => (
                                <Chip key={cargo.id} icon="history" onPress={() => handleCargoChange(cargo.id)} style={{ flex: 1 }}>
                                    {cargo.cargoName}
                                </Chip>
                            ))}
                        </View>

                        <Button
                            mode="contained"
                            onPress={onSearch}
                            loading={isSearching}
                            style={{ marginBottom: 4 }}
                            labelStyle={{ fontSize: 16, fontWeight: "600" }}
                        >
                            Search
                        </Button>
                    </Card.Content>
                </Card>

                {/* 검색 결과 카드 */}
                <Card style={{ borderRadius: 16 }}>
                    <Card.Title title="Search results" />
                    <Divider />
                    {/* 빈 상태 */}
                    {!isSearching && (!historyList || historyList.length === 0) && (
                        <List.Item
                            title="No search results"
                            description="Try changing the filter or press Search to refresh."
                            left={(props) => <List.Icon {...props} icon="magnify" />}
                        />
                    )}
                    {/* 결과 렌더링 */}
                    {historyList?.map((item, idx) => {
                        const meta = statusMeta[Number(item?.status) ?? 1] ?? statusMeta[1];
                        const elapsedMs = calcElapsedMs(item?.startDate, item?.endDate, item?.status);
                        const elapsedText = formatDuration(elapsedMs);
                        const coords = parsePaths(item?.paths);
                        const distKm = totalPathKm(coords);
                        const hasPath = coords.length > 1;
                        return (
                            <View key={item?.id ?? idx}>
                                <List.Item
                                    title={`${item?.cargoName ?? "Unknown destination"}`}
                                    description={() => (
                                        <View style={{ gap: 4 }}>
                                            <Text style={{ opacity: 0.8 }}>
                                                {item?.userName ? `Handler: ${item.userName}` : "Handler: -"}
                                            </Text>
                                            <Text style={{ opacity: 0.8 }}>
                                                {item?.productName
                                                    ? `Item: ${item.productName} · Qty: ${item?.productCount ?? "-"}`
                                                    : `Qty: ${item?.productCount ?? "-"}`}
                                            </Text>
                                            <Text style={{ opacity: 0.8 }}>
                                                {item?.status === 2 ? `Duration: ${elapsedText}` : `Elapsed: ${elapsedText}`}
                                                {distKm > 0 ? ` · Distance: ${distKm} km` : ""}
                                            </Text>
                                        </View>
                                    )}
                                    left={(props) => <List.Icon {...props} icon={meta.icon} />}
                                    right={() => (
                                        <View style={{ alignItems: "flex-end", justifyContent: "center" }}>
                                            <Chip
                                                mode={meta.mode}
                                                icon={meta.icon}
                                                compact
                                                style={{ alignSelf: "flex-end" }}
                                            >
                                                {meta.label}
                                            </Chip>
                                            {hasPath && (
                                                <Badge style={{ marginTop: 6 }} size={20}>
                                                    path
                                                </Badge>
                                            )}
                                        </View>
                                    )}
                                    onPress={() => hasPath && openMapForItem(item)}
                                />
                                {idx < historyList.length - 1 && <Divider />}
                            </View>
                        );
                    })}
                </Card>
            </ScrollView>

            {/* 지도 모달: 선택 항목 경로 표시 */}
            <Portal>
                <Modal visible={mapVisible} onDismiss={closeMap} contentContainerStyle={{ margin: 16, borderRadius: 16, overflow: "hidden" }}>
                    <Card>
                        <Card.Title title={mapTitle || "paths"} right={(props) => <Button onPress={closeMap}>close</Button>} />
                        <Divider />
                        <View style={{ height: 380 }}>
                            <MapView
                                style={{ flex: 1 }}
                                initialRegion={computeRegion(mapCoords)}
                            >
                                {/* 경로 */}
                                {mapCoords.length > 1 && (
                                    <Polyline coordinates={mapCoords} strokeWidth={4} />
                                )}
                                {/* 시작/종료 마커 */}
                                {mapCoords[0] && (
                                    <Marker coordinate={mapCoords[0]} title="Departure" />
                                )}
                                {mapCoords[mapCoords.length - 1] && (
                                    <Marker coordinate={mapCoords[mapCoords.length - 1]} title="Arrival" />
                                )}
                            </MapView>
                        </View>
                        <Card.Content style={{ paddingVertical: 12 }}>
                            <Text style={{ opacity: 0.8, textAlign: "center" }}>
                                {mapCoords?.length > 1
                                    ? `Path points: ${mapCoords.length} · Total ${totalPathKm(mapCoords)} km`
                                    : "Not enough path data."

                                }
                            </Text>
                        </Card.Content>
                    </Card>
                </Modal>
            </Portal>
        </>
    );
}

export default history;
