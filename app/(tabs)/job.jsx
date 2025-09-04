// app/(tabs)/job.jsx
import React, { useMemo, useRef, useState, useEffect } from "react";
import { View, ScrollView } from "react-native";
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
} from "react-native-paper";
import MapView, { Marker, Polyline } from "react-native-maps";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { userCodeAtom } from "atom/userAtom";
import { presenceAtom } from "atom/presenceAtom";
import { haversine } from "utils/geoUtils";
import { instance } from "apis/instance";

const SPEED_KMPH = 10; // ETA 계산용
const FALLBACK = { lat: 37.5665, lng: 126.9780 }; // myLocation 없을 때 기본값

function Job() {
    const userCode = useAtomValue(userCodeAtom);
    const presence = useAtomValue(presenceAtom);

    // step: 'form' | 'route'
    const [step, setStep] = useState("form");

    // 선택 상태
    const [cargoId, setCargoId] = useState(null);
    const [productId, setProductId] = useState(null);

    // 표시용
    const [item, setItem] = useState("");
    const [qty, setQty] = useState("");
    const [banner, setBanner] = useState(false);

    // 지도 목적지
    const [dest, setDest] = useState(null); // {id,label,lat,lng}

    // 메뉴 상태
    const [cargoMenuVisible, setCargoMenuVisible] = useState(false);
    const [productMenuVisible, setProductMenuVisible] = useState(false);

    const cargos = useQuery({
        queryKey: ["cargos"],
        queryFn: () => instance.get("/cargos").then((res) => res.data),
        enabled: !!userCode,
        refetchOnWindowFocus: true,
        retry: 0,
    });

    const products = useQuery({
        queryKey: ["products"],
        queryFn: () => instance.get("/products").then((res) => res.data),
        enabled: !!userCode,
        refetchOnWindowFocus: false,
        retry: 0,
    });

    // 리스트
    const cargoList = Array.isArray(cargos?.data) ? cargos.data : [];
    const productList = Array.isArray(products?.data) ? products.data : [];

    // 선택된 객체
    const selectedCargo = useMemo(
        () => (cargoList ?? []).find((c) => c.id === cargoId),
        [cargoList, cargoId]
    );
    const selectedProduct = useMemo(
        () => (productList ?? []).find((p) => p.id === productId),
        [productList, productId]
    );

    // 내 위치 (presence에서 가져오되 없으면 undefined)
    const myLocation = useMemo(() => {
        return userCode && presence ? presence[userCode] : undefined;
    }, [presence, userCode]);

    // 안전 좌표 (fallback)
    const safeLat = myLocation?.lat ?? FALLBACK.lat;
    const safeLng = myLocation?.lng ?? FALLBACK.lng;

    // cargo 선택 시 목적지 세팅 (lat/lng 키로 통일)
    useEffect(() => {
        if (selectedCargo) {
            const label = selectedCargo.cargoName ?? `Cargo #${selectedCargo.id}`;
            const lat = Number(selectedCargo.lat);
            const lng = Number(selectedCargo.lng);
            if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
                setDest({ id: selectedCargo.id, label, lat, lng });
            } else {
                setDest(null);
            }
        } else {
            setDest(null);
        }
    }, [selectedCargo]);

    // product 선택 시 이름 동기화
    useEffect(() => {
        setItem(selectedProduct?.productName ?? "");
    }, [selectedProduct]);

    // 거리/ETA
    const distanceKm = useMemo(() => {
        if (!dest) return 0;
        return Number(haversine(safeLat, safeLng, dest.lat, dest.lng).toFixed(2));
    }, [dest, safeLat, safeLng]);

    const etaMin = useMemo(() => {
        if (!dest || !distanceKm) return 0;
        return Math.max(1, Math.round((distanceKm / SPEED_KMPH) * 60));
    }, [dest, distanceKm]);

    // 지도
    const mapRef = useRef(null);
    const initialRegion = {
        latitude: safeLat,
        longitude: safeLng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
    };

    useEffect(() => {
        if (step === "route" && mapRef.current && dest && myLocation?.lat && myLocation?.lng) {
            mapRef.current.fitToCoordinates(
                [
                    { latitude: myLocation.lat, longitude: myLocation.lng },
                    { latitude: dest.lat, longitude: dest.lng },
                ],
                { edgePadding: { top: 60, left: 40, right: 40, bottom: 40 }, animated: true }
            );
        }
    }, [step, dest, myLocation]);

    const canStart = !!dest && !!item.trim() && Number(qty) > 0;

    return (
        <>
            <Appbar.Header>
                <Appbar.Content title="Job" />
                <Appbar.Action icon="information-outline" onPress={() => setBanner((v) => !v)} />
            </Appbar.Header>

            {step === "form" ? (
                <ScrollView contentContainerStyle={{ padding: 16, rowGap: 16 }}>
                    {banner && (
                        <Banner
                            visible
                            icon="lightbulb-on-outline"
                            actions={[{ label: "Close", onPress: () => setBanner(false) }]}
                        >
                            After selecting the Cargo, Product and quantity, pressing{" "}
                            <Text style={{ fontWeight: "bold" }}>Start</Text> will display the route on the map.
                        </Banner>
                    )}

                    <Card>
                        <Card.Content style={{ rowGap: 16 }}>
                            {/* Cargo (Menu) */}
                            <Text variant="labelLarge">Cargo</Text>
                            <Menu
                                visible={cargoMenuVisible}
                                onDismiss={() => setCargoMenuVisible(false)}
                                anchor={
                                    <Button
                                        mode="outlined"
                                        onPress={() => setCargoMenuVisible(true)}
                                        disabled={cargos.isLoading || cargos.isError}
                                        style={{ marginBottom: 8 }}
                                        contentStyle={{ height: 48, paddingVertical: 6 }}
                                    >
                                        {selectedCargo?.cargoName ?? "Select the Cargo"}
                                    </Button>
                                }
                            >
                                {cargos.isLoading && <ActivityIndicator style={{ margin: 8 }} />}
                                {cargos.isError && (
                                    <Menu.Item onPress={() => cargos.refetch()} title="Load failed (try again)" />
                                )}
                                {(cargoList ?? []).map((c, idx) => (
                                    <React.Fragment key={c.id}>
                                        <Menu.Item
                                            onPress={() => {
                                                setCargoId(c.id);
                                                setCargoMenuVisible(false);
                                            }}
                                            title={c.cargoName ?? `Cargo #${c.id}`}
                                            titleStyle={{ fontSize: 16 }}
                                            style={{ paddingVertical: 8 }}
                                        />
                                        {idx < cargoList.length - 1 && <Divider />}
                                    </React.Fragment>
                                ))}
                            </Menu>

                            {/* Product (Menu) */}
                            <Text variant="labelLarge">Product</Text>
                            <Menu
                                visible={productMenuVisible}
                                onDismiss={() => setProductMenuVisible(false)}
                                anchor={
                                    <Button
                                        mode="outlined"
                                        onPress={() => setProductMenuVisible(true)}
                                        disabled={products.isLoading || products.isError}
                                        style={{ marginBottom: 8 }}
                                        contentStyle={{ height: 48, paddingVertical: 6 }}
                                    >
                                        {selectedProduct?.productName ?? "Select the Product"}
                                    </Button>
                                }
                            >
                                {products.isLoading && <ActivityIndicator style={{ margin: 8 }} />}
                                {products.isError && (
                                    <Menu.Item onPress={() => products.refetch()} title="Load failed (try again)" />
                                )}
                                {(productList ?? []).map((p, idx) => (
                                    <React.Fragment key={p.id}>
                                        <Menu.Item
                                            onPress={() => {
                                                setProductId(p.id);
                                                setProductMenuVisible(false);
                                            }}
                                            title={p.productName ?? `Product #${p.id}`}
                                            titleStyle={{ fontSize: 16 }}
                                            style={{ paddingVertical: 8 }}
                                        />
                                        {idx < productList.length - 1 && <Divider />}
                                    </React.Fragment>
                                ))}
                            </Menu>

                            {/* 수량 */}
                            <TextInput
                                label="Quantity"
                                placeholder="Enter numbers"
                                value={qty}
                                onChangeText={setQty}
                                keyboardType="numeric"
                                left={<TextInput.Icon icon="counter" />}
                            />

                            <Button mode="contained" disabled={!canStart} onPress={() => setStep("route")}>
                                Start
                            </Button>
                        </Card.Content>
                    </Card>
                </ScrollView>
            ) : (
                <View style={{ flex: 1 }}>
                    <MapView ref={mapRef} style={{ flex: 1 }} initialRegion={initialRegion}>

                        {/* 내 위치 / 목적지 */}
                        <Marker
                            coordinate={{ latitude: safeLat, longitude: safeLng }}
                            title="Me"
                            description="Current Position"
                            pinColor="dodgerblue"
                        />
                        {dest && (
                            <Marker
                                coordinate={{ latitude: dest.lat, longitude: dest.lng }}
                                title={dest.label}
                                description="Destination"
                                pinColor="tomato"
                            />
                        )}
                    </MapView>

                    {/* 하단 정보 카드 */}
                    <Card style={{ position: "absolute", left: 16, right: 16, bottom: 16 }}>
                        <Card.Content>
                            <Text variant="titleMedium">{dest?.label}</Text>
                            <Text style={{ marginTop: 4 }}>Product: {item} · Quantity: {qty || 0}</Text>
                            <Divider style={{ marginVertical: 8 }} />
                            <Text>Distance: {distanceKm} km · ETA: approximately {etaMin}minutes</Text>
                            <View style={{ flexDirection: "row", gap: 16, marginTop: 12 }}>
                                <Button mode="outlined" icon="arrow-left" onPress={() => setStep("form")}>  
                                    correction
                                </Button>
                                <Button
                                    mode="contained"
                                    icon="stop-circle-outline"
                                    onPress={() => {
                                        setStep("form");
                                        setCargoId(null);
                                        setProductId(null);
                                        setItem("");
                                        setQty("");
                                        setDest(null);
                                    }}
                                >
                                    Complete
                                </Button>
                            </View>
                        </Card.Content>
                    </Card>
                </View>
            )}
        </>
    );
}

export default Job;
