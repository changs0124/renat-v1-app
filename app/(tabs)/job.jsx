import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { View, ScrollView, Alert } from "react-native";
import {
    Appbar,
    Card,
    Text,
    TextInput,
    Button,
    Divider,
    Banner,
    Menu,
    ActivityIndicator,
    Portal,
    Modal,
} from "react-native-paper";
import MapView, { Marker, Polyline } from "react-native-maps"; // [CHANGED] Polyline 추가
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { userCodeAtom } from "atom/userAtom";
import { presenceAtom, setWorkingAtom } from "atom/presenceAtom";
import { haversine } from "utils/geoUtils";
import { instance } from "apis/instance";
import AsyncStorage from "@react-native-async-storage/async-storage";
import TabHeader from "components/TabHeader/TabHeader";

const SPEED_KMPH = 10;
const FALLBACK = { lat: 37.5665, lng: 126.978 };
const STORAGE_KEY = "jobId";

// ========================
// [ADD] 경로 수집 파라미터/유틸
// ========================
const PATH_MIN_DIST_M = 5;        // 포인트 사이 최소 이동거리(m)
const PATH_MIN_INTERVAL_MS = 3000; // 최소 기록 간격(ms)
const PATH_MAX_POINTS = 2000;      // 안전장치: 최대 포인트 수

function Job() {
    const userCode = useAtomValue(userCodeAtom);
    const presence = useAtomValue(presenceAtom);
    const setWorking = useAtomValue(setWorkingAtom);

    const [step, setStep] = useState("form");
    const [cargoId, setCargoId] = useState(null);
    const [productId, setProductId] = useState(null);
    const [productCount, setProductCount] = useState("");

    const [banner, setBanner] = useState(false);
    const [cargoMenuVisible, setCargoMenuVisible] = useState(false);
    const [productMenuVisible, setProductMenuVisible] = useState(false);

    const [activeJobId, setActiveJobId] = useState(null);
    const hasActiveJob = !!activeJobId;

    // ========================
    // [ADD] 경로 버퍼/최근 포인트 메타
    // ========================
    const pathRef = useRef([]);           // [{ latitude, longitude, ts }]
    const lastSavedRef = useRef(null);    // { lat, lng }
    const lastTimeRef = useRef(0);        // ms

    // [ADD] 하버사인(m) — 여기 컴포넌트에서 독립적으로 사용
    const haversineM = useCallback((lat1, lng1, lat2, lng2) => {
        const R = 6371000;
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLng = ((lng2 - lng1) * Math.PI) / 180;
        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
        const c = 2 * Math.asin(Math.sqrt(a));
        return R * c;
    }, []);

    // [ADD] 포인트 추가(시간/거리 스로틀 + 최대치 보호)
    const pushPathPoint = useCallback(
        (lat, lng) => {
            const now = Date.now();
            if (now - (lastTimeRef.current ?? 0) < PATH_MIN_INTERVAL_MS) return;

            if (lastSavedRef.current) {
                const d = haversineM(
                    lastSavedRef.current.lat,
                    lastSavedRef.current.lng,
                    lat,
                    lng
                );
                if (d < PATH_MIN_DIST_M) return;
            }

            const next = { latitude: lat, longitude: lng, ts: now };

            if (pathRef.current.length >= PATH_MAX_POINTS) {
                pathRef.current.shift();
            }
            pathRef.current.push(next);
            lastSavedRef.current = { lat, lng };
            lastTimeRef.current = now;
        },
        [haversineM]
    );

    // [ADD] 경로 초기화
    const resetPath = useCallback(() => {
        pathRef.current = [];
        lastSavedRef.current = null;
        lastTimeRef.current = 0;
    }, []);

    const showError = useCallback((fallback, err) => {
        Alert.alert(err?.response?.data?.message ?? fallback);
    }, []);

    const saveActiveJobId = useCallback(async (id) => {
        await AsyncStorage.setItem(STORAGE_KEY, String(id));
        setActiveJobId(Number(id));
    }, []);

    const clearActiveJobId = useCallback(async () => {
        await AsyncStorage.removeItem(STORAGE_KEY);
        setActiveJobId(null);
    }, []);

    useEffect(() => {
        (async () => {
            const idStr = await AsyncStorage.getItem(STORAGE_KEY);
            if (!idStr) return;

            const idNum = Number(idStr);

            if (Number.isNaN(idNum)) {
                await AsyncStorage.removeItem(STORAGE_KEY);
                return;
            }

            setActiveJobId(idNum);
        })();
    }, []);

    const runningJob = useQuery({
        queryKey: ["runningJob", activeJobId],
        queryFn: async () =>
            await instance.get(`/job/running/${activeJobId}`).then((res) => res?.data),
        enabled: !!activeJobId,
        retry: 0,
        refetchOnWindowFocus: true,
    });

    useEffect(() => {
        if (!runningJob.isSuccess || !runningJob.data) return;

        const d = runningJob.data;
        const hasCargo = d.cargoId != null;
        const hasProduct = d.productId != null;
        const hasCount = d.productCount != null && !Number.isNaN(Number(d.productCount));

        if (hasCargo) setCargoId(d.cargoId);
        if (hasProduct) setProductId(d.productId);
        if (hasCount) setProductCount(String(d.productCount));
        if (hasCargo && hasProduct && hasCount) setStep("route");
    }, [runningJob.isSuccess, runningJob.data]);

    useEffect(() => {
        if (!runningJob.isError) return;

        const status = runningJob.error?.response?.status;

        if (status === 404) void clearActiveJobId();

        showError("Failed to query work in progress.", runningJob.error);
        setStep("form");
    }, [runningJob.isError, runningJob.error, clearActiveJobId, showError]);

    const myInfo = useQuery({
        queryKey: ["myInfo", userCode],
        queryFn: async () =>
            await instance.get(`/user/my/${userCode}`).then((res) => res.data),
        enabled: !!userCode,
        retry: 0,
        refetchOnWindowFocus: true,
    });

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

    const cargoList = Array.isArray(cargos?.data) ? cargos.data : [];
    const productList = Array.isArray(products?.data) ? products.data : [];

    const selectedCargo = useMemo(
        () => cargoList.find((c) => c.id === cargoId),
        [cargoList, cargoId]
    );
    const selectedProduct = useMemo(
        () => productList.find((p) => p.id === productId),
        [productList, productId]
    );

    // 내 장치 적재 한도
    const myVolume = useMemo(() => {
        const v = Number(myInfo?.data?.modelVolume);
        return Number.isFinite(v) ? v : null;
    }, [myInfo?.data]);

    // 선택된 제품의 단위 부피
    const productUnitVolume = useMemo(() => {
        const v = Number(selectedProduct?.volume);
        return Number.isFinite(v) ? v : null;
    }, [selectedProduct]);

    // 총 적재량
    const totalVolume = useMemo(() => {
        const cnt = Number(productCount);
        if (!productUnitVolume || !Number.isFinite(cnt)) return null;
        return productUnitVolume * cnt;
    }, [productUnitVolume, productCount]);

    // 최대 수량
    const maxAllowedCount = useMemo(() => {
        if (!myVolume || !productUnitVolume || productUnitVolume <= 0) return null;
        return Math.floor(myVolume / productUnitVolume);
    }, [myVolume, productUnitVolume]);

    const myLocation = presence?.[userCode];
    const safeLat = myLocation?.lat ?? FALLBACK.lat;
    const safeLng = myLocation?.lng ?? FALLBACK.lng;

    const dest = useMemo(() => {
        if (!selectedCargo) return null;

        const lat = Number(selectedCargo.lat);
        const lng = Number(selectedCargo.lng);

        if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

        return {
            id: selectedCargo.id,
            label: selectedCargo.cargoName ?? `Cargo #${selectedCargo.id}`,
            lat,
            lng,
        };
    }, [selectedCargo]);

    const distanceKm = useMemo(() => {
        if (!dest) return 0;

        return Number(haversine(safeLat, safeLng, dest.lat, dest.lng).toFixed(2));
    }, [dest, safeLat, safeLng]);

    const etaMin = useMemo(() => {
        if (!dest || !distanceKm) return 0;

        return Math.max(1, Math.round((distanceKm / SPEED_KMPH) * 60));
    }, [dest, distanceKm]);

    const mapRef = useRef(null);
    const initialRegion = useMemo(
        () => ({
            latitude: safeLat,
            longitude: safeLng,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
        }),
        [safeLat, safeLng]
    );

    useEffect(() => {
        if (
            step !== "route" ||
            !mapRef.current ||
            !dest ||
            !myLocation?.lat ||
            !myLocation?.lng
        )
            return;
        mapRef.current.fitToCoordinates(
            [
                { latitude: myLocation.lat, longitude: myLocation.lng },
                { latitude: dest.lat, longitude: dest.lng },
            ],
            { edgePadding: { top: 60, left: 40, right: 40, bottom: 40 }, animated: true }
        );
    }, [step, dest, myLocation]);

    const productCountNum = Number(productCount);
    const fieldsValid = !!dest && !!selectedProduct && productCountNum > 0 && !!userCode;

    const handleCargoChange = useCallback((id) => {
        setCargoId(id);
        setCargoMenuVisible(false);
    }, []);

    const handleProductChange = useCallback((id) => {
        setProductId(id);
        setProductMenuVisible(false);
    }, []);

    const resetForm = useCallback(() => {
        setStep("form");
        setCargoId(null);
        setProductId(null);
        setProductCount("");
        resetPath(); // [ADD] 폼 리셋 시 경로 버퍼 초기화
    }, [resetPath]);

    const registerJob = useMutation({
        mutationFn: (payload) =>
            instance.post("/job/register", payload).then((res) => res.data),
        onSuccess: async (res) => {
            const jobId =
                typeof res === "number" ? res : res?.id ?? res?.jobId ?? res?.data?.id;

            if (jobId == null)
                return showError(
                    "Error",
                    "Failed to receive jobId from server.",
                    registerJob.error
                );

            await saveActiveJobId(jobId);

            if (typeof setWorking === "function") {
                setWorking(userCode, true); // working=true 선반영 + /app/working 전송
            } else {
                console.warn(
                    "setWorking helper is not ready. Did you wrap with PresenceProvider?"
                );
            }

            setStep("route");
        },
        onError: (err) => showError("Registration Failed", err),
    });

    const updateJob = useMutation({
        mutationFn: (payload) =>
            instance.put("/job/update", payload).then((res) => res.data),
        onSuccess: () => setStep("route"),
        onError: (err) => showError("Update Failed", err),
    });

    const cancelJob = useMutation({
        mutationFn: ({ jobId }) =>
            instance.put(`/job/cancel/${jobId}`).then((res) => res.data),
        onSuccess: async () => {
            await clearActiveJobId();

            if (typeof setWorking === "function") {
                setWorking(userCode, false);
            } else {
                console.warn(
                    "setWorking helper is not ready. Did you wrap with PresenceProvider?"
                );
            }

            resetForm(); // [ADD] 경로 버퍼도 같이 초기화
        },
        onError: (err) => showError("Cancellation Failed", err),
    });

    const completeJob = useMutation({
        mutationFn: ({ jobId, paths }) =>
            instance.put("/job/complete", { jobId, paths }).then((res) => res.data),
        onSuccess: async () => {
            await clearActiveJobId();

            if (typeof setWorking === "function") {
                setWorking(userCode, false);
            } else {
                console.warn(
                    "setWorking helper is not ready. Did you wrap with PresenceProvider?"
                );
            }

            resetForm(); // [ADD] 완료 후 경로 버퍼 정리
        },
        onError: (err) => showError("Completion Failed", err),
    });

    const pending =
        registerJob.isPending ||
        updateJob.isPending ||
        cancelJob.isPending ||
        completeJob.isPending ||
        runningJob.isFetching;

    const syncing = !!activeJobId && (runningJob.isLoading || runningJob.isFetching);

    // ========================
    // [ADD] route 단계 진입 시 경로 초기화 + 시작점 1회 기록
    // ========================
    useEffect(() => {
        if (step !== "route") return;
        resetPath();
        if (presence?.[userCode]?.lat && presence?.[userCode]?.lng) {
            pushPathPoint(presence[userCode].lat, presence[userCode].lng);
        }
    }, [step, presence, userCode, resetPath, pushPathPoint]);

    // ========================
    // [ADD] 내 위치 변동 시 경로 포인트 스로틀 기록 (route 단계에서만)
    // ========================
    useEffect(() => {
        if (step !== "route") return;
        const lat = presence?.[userCode]?.lat;
        const lng = presence?.[userCode]?.lng;
        if (!lat || !lng) return;
        pushPathPoint(lat, lng);
    }, [step, presence?.[userCode]?.lat, presence?.[userCode]?.lng, userCode, pushPathPoint]);

    // ========================
    // [ADD] (옵션) 지도에 실시간 Polyline 그리기
    // ========================
    const polylineCoords = useMemo(() => pathRef.current, [pathRef.current?.length]); // 길이 변화에 반응

    const handleStartOrUpdate = useCallback(() => {
        if (!fieldsValid) return;

        // 용량 체크
        if (myVolume && productUnitVolume && productUnitVolume > 0) {
            const total = productUnitVolume * productCountNum;
            if (total > myVolume) {
                const capped = Math.max(0, Math.floor(myVolume / productUnitVolume));
                Alert.alert(
                    "Capacity exceeded",
                    `The selected quantity exceeds your device capacity.\n\nMax allowed: ${capped}`,
                    [{ text: "OK" }]
                );
                setProductCount(String(capped));
                return;
            }
        }

        const base = { cargoId, productId, productCount: productCountNum, paths: "[]" };
        hasActiveJob
            ? updateJob.mutate({ ...base, jobId: activeJobId })
            : registerJob.mutate({
                userCode,
                cargoId,
                productId,
                productCount: productCountNum,
            });
    }, [
        fieldsValid,
        hasActiveJob,
        updateJob,
        registerJob,
        activeJobId,
        userCode,
        cargoId,
        productId,
        productCountNum,
        myVolume,
        productUnitVolume,
    ]);

    return (
        <>
            <TabHeader
                title={"Job"}
                icon={"information-outline"}
                onPress={() => setBanner((v) => !v)}
            />
            {step === "form" ? (
                <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                    {banner && (
                        <Banner
                            visible
                            icon="lightbulb-on-outline"
                            actions={[{ label: "Close", onPress: () => setBanner(false) }]}
                            style={{ borderRadius: 16 }}
                        >
                            After selecting Cargo, Product, and Quantity, press{" "}
                            <Text style={{ fontWeight: "bold" }}>
                                {hasActiveJob ? "Update" : "Start"}
                            </Text>{" "}
                            to proceed to the map.
                            {hasActiveJob && <Text> (Active Job ID: {activeJobId})</Text>}
                        </Banner>
                    )}
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
                                        disabled={cargos.isLoading || cargos.isError || pending}
                                        style={{ marginBottom: 4, borderRadius: 16 }}
                                        labelStyle={{ fontSize: 16, fontWeight: "600" }}
                                    >
                                        {selectedCargo?.cargoName ?? "Select the Cargo"}
                                    </Button>
                                }
                            >
                                {cargos.isLoading && <ActivityIndicator style={{ margin: 8 }} />}
                                {cargos.isError && (
                                    <Menu.Item onPress={() => cargos.refetch()} title="Load failed (try again)" />
                                )}
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
                                        disabled={products.isLoading || products.isError || pending}
                                        style={{ marginBottom: 4, borderRadius: 16 }}
                                        labelStyle={{ fontSize: 16, fontWeight: "600" }}
                                    >
                                        {selectedProduct?.productName ?? "Select the Product"}
                                    </Button>
                                }
                            >
                                {products.isLoading && <ActivityIndicator style={{ margin: 8 }} />}
                                {products.isError && (
                                    <Menu.Item onPress={() => products.refetch()} title="Load failed (try again)" />
                                )}
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

                            <TextInput
                                label="Quantity"
                                placeholder="Enter numbers"
                                value={productCount}
                                onChangeText={setProductCount}
                                keyboardType="numeric"
                                left={<TextInput.Icon icon="counter" />}
                                disabled={pending}
                                style={{
                                    borderTopLeftRadius: 16,
                                    borderTopRightRadius: 16,
                                    opacity: 0.8,
                                    fontSize: 16,
                                    fontWeight: "600",
                                }}
                            />

                            {(myVolume || productUnitVolume) && (
                                <Text
                                    style={{
                                        marginBottom: 4,
                                        paddingLeft: 4,
                                        opacity: 0.6,
                                        fontSize: 14,
                                        fontWeight: 400,
                                    }}
                                >
                                    {myVolume ? `Capacity: ${myVolume}` : ""}
                                    {myVolume && productUnitVolume ? " · " : ""}
                                    {productUnitVolume ? `Unit Volume: ${productUnitVolume}` : ""}
                                    {typeof maxAllowedCount === "number" ? ` · Max Qty: ${maxAllowedCount}` : ""}
                                </Text>
                            )}

                            <Button
                                mode="contained"
                                disabled={!fieldsValid || pending}
                                onPress={handleStartOrUpdate}
                                style={{ marginBottom: 4 }}
                                labelStyle={{ fontSize: 16, fontWeight: "600" }}
                            >
                                {registerJob.isPending || updateJob.isPending
                                    ? hasActiveJob
                                        ? "Updating..."
                                        : "Starting..."
                                    : hasActiveJob
                                        ? "Update"
                                        : "Start"}
                            </Button>

                            {hasActiveJob && (
                                <View
                                    style={{
                                        boxShadow: "borderBox",
                                        flexDirection: "row",
                                        justifyContent: "space-between",
                                    }}
                                >
                                    <Button
                                        mode="outlined"
                                        icon="map"
                                        onPress={() => setStep("route")}
                                        disabled={pending}
                                        labelStyle={{ fontSize: 14, fontWeight: "400" }}
                                    >
                                        Go to route
                                    </Button>
                                    <Button
                                        mode="contained"
                                        icon="cancel"
                                        onPress={() => cancelJob.mutate({ jobId: activeJobId })}
                                        disabled={pending}
                                        labelStyle={{ fontSize: 14, fontWeight: "400" }}
                                    >
                                        Cancel delivery
                                    </Button>
                                </View>
                            )}
                        </Card.Content>
                    </Card>
                </ScrollView>
            ) : (
                <View style={{ flex: 1 }}>
                    <MapView ref={mapRef} style={{ flex: 1 }} initialRegion={initialRegion}>
                        {/* 내 위치 */}
                        <Marker
                            coordinate={{ latitude: safeLat, longitude: safeLng }}
                            pinColor="dodgerblue"
                        />
                        {/* 목적지 */}
                        {dest && (
                            <Marker
                                coordinate={{ latitude: dest.lat, longitude: dest.lng }}
                                title={dest.label}
                            />
                        )}
                        {/* [ADD] 실시간 경로 폴리라인 (선택) */}
                        {polylineCoords?.length > 1 && (
                            <Polyline
                                coordinates={polylineCoords}
                                strokeWidth={4}
                            // 색상 지정 안 하면 플랫폼 기본색; 필요하면 지정해도 됨
                            />
                        )}
                    </MapView>

                    <Card style={{ position: "absolute", left: 16, right: 16, bottom: 16 }}>
                        <Card.Content>
                            <Text variant="titleMedium">{dest?.label ?? "No destination selected"}</Text>
                            <Text style={{ paddingVertical: 4, opacity: 0.6, fontSize: 14, fontWeight: 400 }}>
                                Product: {selectedProduct?.productName || "-"}
                            </Text>
                            <Text style={{ opacity: 0.6, fontSize: 14, fontWeight: 400 }}>
                                Quantity: {productCount || 0}
                            </Text>
                            <Divider style={{ marginVertical: 4 }} />
                            <Text style={{ paddingBottom: 4, opacity: 0.6, fontSize: 14, fontWeight: 400 }}>
                                Distance: {distanceKm} km
                            </Text>
                            <Text style={{ opacity: 0.6, fontSize: 14, fontWeight: 400 }}>
                                ETA: approximately {etaMin} minutes
                            </Text>

                            <View
                                style={{
                                    justifyContent: "flex-end",
                                    flexDirection: "row",
                                    gap: 12,
                                    marginTop: 12,
                                    flexWrap: "wrap",
                                }}
                            >
                                <Button
                                    mode="outlined"
                                    icon="arrow-left"
                                    onPress={() => setStep("form")}
                                    disabled={pending}
                                    style={{ flex: 1 }}
                                    labelStyle={{ fontSize: 14, fontWeight: "400" }}
                                >
                                    correction
                                </Button>

                                {hasActiveJob && (
                                    <Button
                                        mode="contained"
                                        icon="check-circle"
                                        onPress={() => {
                                            // [ADD] 완료 시 경로를 JSON 문자열로 포함
                                            const pathsJson = JSON.stringify(pathRef.current ?? []);
                                            completeJob.mutate({ jobId: activeJobId, paths: pathsJson });
                                        }}
                                        disabled={pending}
                                        labelStyle={{ fontSize: 14, fontWeight: "400" }}
                                    >
                                        Complete
                                    </Button>
                                )}
                            </View>
                        </Card.Content>
                    </Card>
                </View>
            )}

            <Portal>
                <Modal
                    visible={syncing}
                    dismissable={false}
                    contentContainerStyle={{ marginHorizontal: 24 }}
                >
                    <Card style={{ padding: 16, borderRadius: 12, alignItems: "center" }}>
                        <ActivityIndicator />
                        <Text style={{ marginTop: 12 }}>Synchronizing work in progress.</Text>
                    </Card>
                </Modal>
            </Portal>
        </>
    );
}

export default Job;
