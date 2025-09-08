import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation } from "@tanstack/react-query";
import { instance } from "apis/instance";
import { presenceAtom, socketStatusAtom } from "atom/presenceAtom";
import { userCodeAtom } from "atom/userAtom";
import TabHeader from "components/TabHeader/TabHeader";
import { useAtomValue } from "jotai";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, ScrollView } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { SegmentedButtons, Card, Text, List, Avatar, Divider, Banner, IconButton, ActivityIndicator } from "react-native-paper";
import { haversine } from "utils/geoUtils";
// [REMOVED] status 유틸 제거
// import { checkUserStatus } from "utils/statusUtils";

// [FIX] 시청 좌표(기본값)
const SEOUL_CITY_HALL = { lat: 37.5665, lng: 126.9780 };

// 색상/아이콘 매핑 (working 기준)
// stable(working=false): 초록, check 아이콘
// working(true): 파랑, progress 아이콘
const UI_BY_WORKING = {
    stable: { color: "#10b981", icon: "check-circle" },
    working: { color: "#3b82f6", icon: "progress-clock" },
};

function index() {
    const presence = useAtomValue(presenceAtom) || {}; // [FIX] undefined 안전
    const socketStatus = useAtomValue(socketStatusAtom);
    const userCode = useAtomValue(userCodeAtom);

    // [CHANGED] 필터: all / stable / working
    const [filter, setFilter] = useState("all");
    const [banner, setBanner] = useState(true);

    const mapRef = useRef(null);
    const sheetRef = useRef(null);
    const snapPoints = useMemo(() => ["28%", "55%"], []);
    const [sheetData, setSheetData] = useState(null);

    // [FIX] 내 위치 선반영: presence[userCode]가 없을 때도 안전
    const myLocation = useMemo(() => {
        return userCode ? presence[userCode] : undefined;
    }, [presence, userCode]);

    // [FIX] 최초 마운트용 초기 좌표: 내 좌표 없으면 시청
    const initialRegion = useMemo(
        () => ({
            latitude: myLocation?.lat ?? SEOUL_CITY_HALL.lat,
            longitude: myLocation?.lng ?? SEOUL_CITY_HALL.lng,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
        }),
        [] // 초기 렌더에만 사용
    );

    const focusMeRef = useRef(false);
    useEffect(() => {
        if (
            !focusMeRef.current &&
            myLocation?.lat != null &&
            myLocation?.lng != null &&
            mapRef.current
        ) {
            focusMeRef.current = true;
            mapRef.current.animateToRegion(
                {
                    latitude: myLocation.lat,
                    longitude: myLocation.lng,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                },
                600
            );
        }
    }, [myLocation?.lat, myLocation?.lng]);

    // [CHANGED] users: status 대신 working으로 수집
    const users = useMemo(() => {
        const entries = Object.entries(presence);
        return entries
            .filter(([code]) => code !== userCode)
            .map(([code, p]) => {
                const distanceKm =
                    myLocation?.lat != null && myLocation?.lng != null
                        ? Number(haversine(myLocation.lat, myLocation.lng, p.lat, p.lng).toFixed(2))
                        : null;

                return {
                    id: code,
                    userName: p.userName,
                    lat: p.lat,
                    lng: p.lng,
                    working: !!p.working, // 핵심 불린
                    distanceKm,
                };
            });
    }, [presence, userCode, myLocation?.lat, myLocation?.lng]);

    // [CHANGED] 필터링: all / stable(working=false) / working(true)
    const filtered = useMemo(() => {
        return users.filter((u) => {
            if (filter === "all") return true;
            if (filter === "stable") return !u.working;
            if (filter === "working") return u.working;
            return true;
        });
    }, [users, filter]);

    const userInfo = useMutation({
        mutationFn: async (data) => await instance.get(`/job/${data}`),
        onSuccess: (res) => setSheetData(res?.data),
    });

    const handleFocusOnmyLocationOnPress = () => {
        if (myLocation?.lat && myLocation?.lng) {
            mapRef.current?.animateToRegion(
                {
                    latitude: myLocation.lat,
                    longitude: myLocation.lng,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                },
                600
            );
        }
    };

    const handleMarkerOnPress = (data) => {
        setSheetData(null);
        try {
            sheetRef.current?.snapToIndex(1);
        } catch {
            sheetRef.current?.expand?.();
        }
        if (!userInfo.isPending) userInfo.mutate(data);
    };

    return (
        <>
            <TabHeader title={"Home"} icon={"bell-outline"} />
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                {banner && (
                    <Banner
                        visible
                        icon={
                            socketStatus === "connected"
                                ? "access-point-network"
                                : socketStatus === "connecting"
                                    ? "lan-pending"
                                    : "wifi-off"
                        }
                        actions={[{ label: "close", onPress: () => setBanner(false) }]}
                        style={{ borderRadius: 16 }}
                    >
                        {socketStatus === "connected" &&
                            (myLocation
                                ? "Broker connected · My location received"
                                : "Broker connected · Waiting to receive my location")}
                        {socketStatus === "connecting" && "Connecting to broker..."}
                        {socketStatus === "disconnected" &&
                            "Disconnected · Attempting to automatically reconnect"}
                    </Banner>
                )}

                {/* [CHANGED] 필터 버튼: all / stable / working */}
                <SegmentedButtons
                    value={filter}
                    onValueChange={setFilter}
                    buttons={[
                        { value: "all", label: "All", labelStyle: { opacity: 0.8, fontSize: 16, fontWeight: "600" } },
                        { value: "stable", label: "Stable", labelStyle: { opacity: 0.8, fontSize: 16, fontWeight: "600" } },
                        { value: "working", label: "Working", labelStyle: { opacity: 0.8, fontSize: 16, fontWeight: "600" } },
                    ]}
                    style={{ opacity: 0.8 }}
                />

                <Card style={{ overflow: "hidden", borderRadius: 16 }}>
                    <View style={{ minHeight: 250 }}>
                        <MapView ref={mapRef} style={{ flex: 1 }} initialRegion={initialRegion}>
                            {/* 내 위치: 파란 핀 유지 */}
                            {myLocation?.lat && myLocation?.lng && (
                                <Marker
                                    coordinate={{ latitude: myLocation.lat, longitude: myLocation.lng }}
                                    pinColor="purple"
                                />
                            )}

                            {/* 상대 사용자: working(파랑) / stable(초록) */}
                            {filtered.map((u) => (
                                <Marker
                                    key={u.id}
                                    coordinate={{ latitude: u.lat, longitude: u.lng }}
                                    pinColor={u.working ? UI_BY_WORKING.working.color : UI_BY_WORKING.stable.color}
                                    onPress={() => handleMarkerOnPress(u.id)}
                                />
                            ))}
                        </MapView>

                        <View
                            pointerEvents="box-none"
                            style={{ position: "absolute", bottom: 5, right: 5, zIndex: 2 }}
                        >
                            <IconButton
                                mode="contained"
                                icon="crosshairs-gps"
                                size={23}
                                onPress={handleFocusOnmyLocationOnPress}
                                containerColor="#dbdbdb"
                                iconColor="#222"
                                style={{ elevation: 3 }}
                            />
                        </View>
                    </View>
                </Card>

                <Card style={{ borderRadius: 16 }}>
                    <Card.Title
                        title="User-List"
                        style={{ paddingHorizontal: 10, paddingTop: 8, paddingLeft: 20 }}
                        titleStyle={{ opacity: 0.8, fontSize: 18, fontWeight: "600" }}
                    />
                    <Divider style={{ marginHorizontal: 10 }} />
                    <View style={{ paddingHorizontal: 10 }}>
                        {filtered
                            .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9))
                            .map((u, idx, arr) => {
                                const ui = u.working ? UI_BY_WORKING.working : UI_BY_WORKING.stable;
                                return (
                                    <View key={u.id}>
                                        <List.Item
                                            title={u.userName}
                                            description={
                                                u.distanceKm != null
                                                    ? `Distance ${u.distanceKm} km · ${u.working ? "working" : "stable"}`
                                                    : `${u.working ? "working" : "stable"}`
                                            }
                                            style={{ paddingLeft: 6, paddingVertical: 6 }}
                                            left={(props) => (
                                                <Avatar.Icon
                                                    {...props}
                                                    icon={ui.icon}
                                                    color="white"
                                                    size={50}
                                                    style={{ backgroundColor: ui.color }}
                                                />
                                            )}
                                            onPress={() => {
                                                mapRef.current?.animateToRegion(
                                                    {
                                                        latitude: u.lat,
                                                        longitude: u.lng,
                                                        latitudeDelta: 0.01,
                                                        longitudeDelta: 0.01,
                                                    },
                                                    500
                                                );
                                            }}
                                            titleStyle={{ opacity: 0.8, fontSize: 16, fontWeight: "600" }}
                                            descriptionStyle={{ opacity: 0.6, fontSize: 14, fontWeight: "400" }}
                                        />
                                        {idx < arr.length - 1 && <Divider />}
                                    </View>
                                );
                            })}
                        {filtered.length === 0 && (
                            <View
                                style={{
                                    boxSizing: "border-box",
                                    minHeight: 150,
                                    justifyContent: "center",
                                    alignItems: "center",
                                }}
                            >
                                <Text style={{ opacity: 0.6, fontSize: 16, fontWeight: 600 }}>
                                    There are no matching users.
                                </Text>
                            </View>
                        )}
                    </View>
                </Card>
            </ScrollView>

            <BottomSheet
                ref={sheetRef}
                index={-1}
                snapPoints={snapPoints}
                enablePanDownToClose
                handleIndicatorStyle={{ backgroundColor: "#bbbbbb" }}
            >
                <BottomSheetView style={{ padding: 16, gap: 8 }}>
                    {userInfo.isPending && (
                        <View style={{ paddingVertical: 8 }}>
                            <ActivityIndicator />
                        </View>
                    )}

                    {!!sheetData && (
                        <>
                            <Text style={{ opacity: 0.8, fontSize: 16, fontWeight: "600" }}>
                                {sheetData.userName || "No userName"}
                            </Text>
                            <Text style={{ opacity: 0.6, fontSize: 14, fontWeight: "400" }}>
                                Model: {sheetData.modelNumber || "-"}
                            </Text>
                            <Text style={{ opacity: 0.6, fontSize: 14, fontWeight: "400" }}>
                                Volume: {sheetData.modelVolume ?? 0}
                            </Text>
                            <Divider />
                            {/* 아래 status는 "작업 정보"의 상태로 보이므로 기존 유지 (필요시 working으로도 변경 가능) */}
                            {sheetData.status === 1 ? (
                                <View style={{ marginTop: 8 }}>
                                    <Text style={{ marginTop: 8, opacity: 0.6, fontSize: 14, fontWeight: "400" }}>
                                        Cargo: {sheetData.cargoName || "-"}
                                    </Text>
                                    <Text style={{ opacity: 0.6, fontSize: 14, fontWeight: "400" }}>
                                        Product: {sheetData.productName || "-"} x {sheetData.productCount ?? 0}
                                    </Text>
                                    <Text style={{ opacity: 0.6, fontSize: 14, fontWeight: "400" }}>
                                        Volume: {sheetData.productVolume ?? 0}
                                    </Text>
                                </View>
                            ) : (
                                <Text style={{ marginTop: 8, opacity: 0.6, fontSize: 14, fontWeight: "400" }}>
                                    Not in progress
                                </Text>
                            )}
                        </>
                    )}

                    {userInfo.isError && !userInfo.isPending && !sheetData && (
                        <View style={{ minHeight: 150, justifyContent: "center", alignItems: "center" }}>
                            <Text style={{ opacity: 0.6, fontSize: 14, fontWeight: "400" }}>
                                Failed to retrieve information. Please try again.
                            </Text>
                        </View>
                    )}
                </BottomSheetView>
            </BottomSheet>
        </>
    );
}

export default index;
