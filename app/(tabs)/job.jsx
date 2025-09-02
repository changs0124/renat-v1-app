// app/(tabs)/job.jsx
import React, { useMemo, useRef, useState, useEffect } from "react";
import { View, ScrollView } from "react-native";
import {
    Appbar,
    Card,
    Text,
    TextInput,
    Button,
    Chip,
    Divider,
    Banner,
} from "react-native-paper";
import MapView, { Marker, Polyline } from "react-native-maps";

// ---- 샘플 내 위치(나중에 atom/소켓 값으로 교체) ----
const MY = { lat: 37.5665, lng: 126.9780 };

// ---- 샘플 목적지 3개 ----
const DESTS = [
    { id: "a", label: "A동 3층", lat: 37.5685, lng: 126.9820 },
    { id: "b", label: "포장실", lat: 37.5640, lng: 126.9760 },
    { id: "c", label: "B창고 2열", lat: 37.5710, lng: 126.9750 },
];

// 거리(km)
const haversine = (lat1, lng1, lat2, lng2) => {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const SPEED_KMPH = 10; // ETA 계산용(지게차 가정). 필요 시 조정

function job() {
    // step: 'form' | 'route'
    const [step, setStep] = useState("form");
    const [dest, setDest] = useState(null);               // {id,label,lat,lng}
    const [item, setItem] = useState("");
    const [qty, setQty] = useState("");
    const [banner, setBanner] = useState(false);

    const distanceKm = useMemo(
        () => (dest ? Number(haversine(MY.lat, MY.lng, dest.lat, dest.lng).toFixed(2)) : 0),
        [dest]
    );
    const etaMin = useMemo(
        () => (dest ? Math.max(1, Math.round((distanceKm / SPEED_KMPH) * 60)) : 0),
        [dest, distanceKm]
    );

    const mapRef = useRef(null);
    const initialRegion = {
        latitude: MY.lat,
        longitude: MY.lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
    };

    useEffect(() => {
        if (step === "route" && mapRef.current && dest) {
            mapRef.current.fitToCoordinates(
                [
                    { latitude: MY.lat, longitude: MY.lng },
                    { latitude: dest.lat, longitude: dest.lng },
                ],
                { edgePadding: { top: 60, left: 40, right: 40, bottom: 40 }, animated: true }
            );
        }
    }, [step, dest]);

    const canStart = dest && item.trim() && Number(qty) > 0;
    return (
        <>
            <Appbar.Header>
                <Appbar.Content title="작업" />
                <Appbar.Action icon="information-outline" onPress={() => setBanner((v) => !v)} />
            </Appbar.Header>

            {step === "form" ? (
                <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                    {banner && (
                        <Banner
                            visible
                            icon="lightbulb-on-outline"
                            actions={[{ label: "닫기", onPress: () => setBanner(false) }]}
                        >
                            목적지/적재물/수량 입력 후 <Text style={{ fontWeight: "bold" }}>시작</Text>을 누르면
                            지도에서 경로가 표시됩니다.
                        </Banner>
                    )}

                    <Card>
                        <Card.Title title="작업 정보" subtitle="목적지 · 적재물 · 수량" />
                        <Card.Content style={{ gap: 12 }}>
                            <Text variant="labelLarge">목적지</Text>
                            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                                {DESTS.map((d) => (
                                    <Chip
                                        key={d.id}
                                        selected={dest?.id === d.id}
                                        onPress={() => setDest(d)}
                                        icon={dest?.id === d.id ? "check" : "map-marker"}
                                    >
                                        {d.label}
                                    </Chip>
                                ))}
                            </View>

                            <TextInput
                                label="적재물"
                                placeholder="예) 팔레트, BOX 등"
                                value={item}
                                onChangeText={setItem}
                                left={<TextInput.Icon icon="package-variant-closed" />}
                            />

                            <TextInput
                                label="수량"
                                placeholder="숫자 입력"
                                value={qty}
                                onChangeText={setQty}
                                keyboardType="numeric"
                                left={<TextInput.Icon icon="counter" />}
                            />

                            <Button
                                mode="contained"
                                disabled={!canStart}
                                onPress={() => setStep("route")}
                            >
                                시작
                            </Button>
                        </Card.Content>
                    </Card>
                </ScrollView>
            ) : (
                // step === 'route'
                <View style={{ flex: 1 }}>
                    <MapView ref={mapRef} style={{ flex: 1 }} initialRegion={initialRegion}>
                        {/* 경로 (직선 Polyline; 실제 길찾기는 Directions API로 교체) */}
                        {dest && (
                            <Polyline
                                coordinates={[
                                    { latitude: MY.lat, longitude: MY.lng },
                                    { latitude: dest.lat, longitude: dest.lng },
                                ]}
                                strokeWidth={5}
                                strokeColor="#3b82f6"
                            />
                        )}

                        {/* 내 위치 / 목적지 마커 */}
                        <Marker
                            coordinate={{ latitude: MY.lat, longitude: MY.lng }}
                            title="나"
                            description="현재 위치"
                            pinColor="dodgerblue"
                        />
                        {dest && (
                            <Marker
                                coordinate={{ latitude: dest.lat, longitude: dest.lng }}
                                title={dest.label}
                                description="목적지"
                                pinColor="tomato"
                            />
                        )}
                    </MapView>

                    {/* 하단 정보 카드 */}
                    <Card style={{ position: "absolute", left: 16, right: 16, bottom: 16 }}>
                        <Card.Content>
                            <Text variant="titleMedium">{dest?.label}</Text>
                            <Text style={{ marginTop: 4 }}>
                                적재물: {item} · 수량: {qty}
                            </Text>
                            <Divider style={{ marginVertical: 8 }} />
                            <Text>거리: {distanceKm} km · ETA: 약 {etaMin}분</Text>
                            <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
                                <Button mode="outlined" icon="arrow-left" onPress={() => setStep("form")}>
                                    수정
                                </Button>
                                <Button
                                    mode="contained"
                                    icon="stop-circle-outline"
                                    onPress={() => {
                                        // 종료(초기화)
                                        setStep("form");
                                        // 실제에선 완료 이벤트 전송/저장 처리
                                    }}
                                >
                                    종료
                                </Button>
                            </View>
                        </Card.Content>
                    </Card>
                </View>
            )}
        </>
    );
}

export default job;