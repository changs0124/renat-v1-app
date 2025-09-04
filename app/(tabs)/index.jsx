import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation } from "@tanstack/react-query";
import { instance } from "apis/instance";
import { presenceAtom, socketStatusAtom } from "atom/presenceAtom";
import { userCodeAtom } from "atom/userAtom";
import { useAtomValue } from "jotai";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, ScrollView } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { Appbar, Searchbar, SegmentedButtons, Card, Text, List, Avatar, Divider, Badge, Banner, IconButton, ActivityIndicator } from "react-native-paper";
import { haversine } from "utils/geoUtils";
import { checkUserStatus } from "utils/statusUtils";

// [FIX] 시청 좌표(기본값)
const SEOUL_CITY_HALL = { lat: 37.5665, lng: 126.9780 };

function index() {
    const presence = useAtomValue(presenceAtom) || {}; // [FIX] undefined 안전
    const socketStatus = useAtomValue(socketStatusAtom);
    const userCode = useAtomValue(userCodeAtom);

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
            latitude: (myLocation?.lat ?? SEOUL_CITY_HALL.lat),
            longitude: (myLocation?.lng ?? SEOUL_CITY_HALL.lng),
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
        }),
        [/* 초기 마운트만 쓰일 값이라 deps 없어도 되지만 안전하게 기본값에만 의존 */]
    );

    // [FIX] myLocation이 “처음으로 유효해지는 순간” 자동 포커스
    const didCenterOnceRef = useRef(false);
    useEffect(() => {
        if (
            !didCenterOnceRef.current &&
            myLocation?.lat != null &&
            myLocation?.lng != null &&
            mapRef.current
        ) {
            didCenterOnceRef.current = true;
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

    const users = useMemo(() => {
        const entries = Object.entries(presence);
        return entries
            .filter(([code]) => code !== userCode)
            .map(([code, p]) => ({
                id: code,
                lat: p.lat,
                lng: p.lng,
                status: checkUserStatus(p.status),
                distanceKm:
                    myLocation?.lat != null && myLocation?.lng != null
                        ? Number(haversine(myLocation.lat, myLocation.lng, p.lat, p.lng).toFixed(2))
                        : null,
            }));
    }, [presence, userCode, myLocation?.lat, myLocation?.lng]);

    const filtered = useMemo(() => {
        return users.filter((u) => {
            const okStatus =
                filter === "all"
                    ? true
                    : filter === "online"
                        ? u.status === "online"
                        : u.status === "offline";
            return okStatus;
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
            <Appbar.Header>
                <Appbar.Content title="Home" />
                <Appbar.Action icon="bell-outline" onPress={() => { }} />
            </Appbar.Header>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                {banner && (
                    <Banner
                        visible
                        icon={socketStatus === 'connected' ? 'access-point-network' :
                            socketStatus === 'connecting' ? 'lan-pending' : 'wifi-off'}
                        actions={[{ label: "close", onPress: () => setBanner(false) }]}
                        style={{ borderRadius: 15 }}
                    >
                        {socketStatus === 'connected' && (myLocation ? "Broker connected · My location received" : "Broker connected · Waiting to receive my location")}
                        {socketStatus === 'connecting' && "Connecting to broker..."}
                        {socketStatus === 'disconnected' && "Disconnected · Attempting to automatically reconnect"}
                    </Banner>
                )}

                <SegmentedButtons
                    value={filter}
                    onValueChange={setFilter}
                    buttons={[
                        { value: "all", label: "All" },
                        { value: "online", label: "On-line" },
                        { value: "offline", label: "Off-line" },
                    ]}
                    style={{ marginTop: 4 }}
                />

                {/* 지도 */}
                <Card style={{ overflow: "hidden" }}>
                    <View style={{ height: 260 }}>
                        {/* [NOTE] initialRegion은 마운트 시 1회만 사용됨 */}
                        <MapView ref={mapRef} style={{ flex: 1 }} initialRegion={initialRegion}>
                            {/* 내 위치 */}
                            {myLocation?.lat && myLocation?.lng && (
                                <Marker
                                    coordinate={{ latitude: myLocation.lat, longitude: myLocation.lng }}
                                    pinColor="dodgerblue"
                                />
                            )}

                            {/* 다른 사용자 */}
                            {filtered.map((u) => (
                                <Marker
                                    key={u.id}
                                    coordinate={{ latitude: u.lat, longitude: u.lng }}
                                    pinColor={u.status === "online" ? "green" : "gray"}
                                    onPress={() => handleMarkerOnPress(u.id)}
                                />
                            ))}
                        </MapView>

                        {/* 오버레이 버튼 */}
                        <View
                            pointerEvents="box-none"
                            style={{ position: "absolute", bottom: 10, right: 10, zIndex: 2 }}
                        >
                            <IconButton
                                mode="contained"
                                icon="crosshairs-gps"
                                size={22}
                                onPress={handleFocusOnmyLocationOnPress}
                                containerColor="#dbdbdb"
                                iconColor="#222"
                                style={{ elevation: 3 }}
                            />
                        </View>
                    </View>
                </Card>

                {/* 리스트 */}
                <Card>
                    <Card.Title
                        title="Users"
                        style={{ paddingHorizontal: 10, paddingTop: 8, paddingLeft: 20 }}
                    />
                    <Divider style={{ marginHorizontal: 10 }} />
                    <View style={{ paddingHorizontal: 10 }}>
                        {filtered
                            .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9))
                            .map((u, idx, arr) => (
                                <View key={u.id}>
                                    <List.Item
                                        title={u.id}
                                        description={
                                            u.distanceKm != null
                                                ? `Distance ${u.distanceKm} km · ${u.status}`
                                                : `${u.status}`
                                        }
                                        style={{ paddingHorizontal: 0, paddingVertical: 6 }}
                                        left={(props) => (
                                            <Avatar.Icon
                                                {...props}
                                                icon={u.status === "online" ? "account-check" : "account-off"}
                                                color="white"
                                                style={{
                                                    backgroundColor:
                                                        u.status === "online" ? "#10b981" : "#9ca3af",
                                                }}
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
                                    />
                                    {idx < arr.length - 1 && <Divider />}
                                </View>
                            ))}

                        {filtered.length === 0 && (
                            <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                                <Text style={{ opacity: 0.6, textAlign: 'center' }}>
                                    There are no matching users.
                                </Text>
                            </View>
                        )}
                    </View>
                </Card>
            </ScrollView>

            {/* BottomSheet: 마커 상세 */}
            <BottomSheet
                ref={sheetRef}
                index={-1}
                snapPoints={snapPoints}
                enablePanDownToClose
                handleIndicatorStyle={{ backgroundColor: "#bbb" }}
            >
                <BottomSheetView style={{ padding: 16, gap: 8 }}>
                    {/* 로딩 */}
                    {userInfo.isPending && (
                        <View style={{ paddingVertical: 8 }}>
                            <ActivityIndicator />
                        </View>
                    )}

                    {/* 데이터 표시 */}
                    {!!sheetData && (
                        <>
                            {/* 항상 채워지는 기본 3개 */}
                            <Text style={{ fontWeight: "700", fontSize: 16 }}>
                                {sheetData.userName || "No userName"}
                            </Text>
                            <Text>Model: {sheetData.modelNumber || "-"}</Text>
                            <Text>Volume: {sheetData.modelVolume ?? 0}</Text>

                            {/* 진행 중이면 상세 */}
                            {sheetData.status === 1 ? (
                                <View style={{ marginTop: 8 }}>
                                    <Divider />
                                    <Text style={{ marginTop: 8 }}>Cargo: {sheetData.cargoName || "-"}</Text>
                                    <Text>
                                        Product: {sheetData.productName || "-"} x {sheetData.productCount ?? 0}
                                    </Text>
                                    <Text>Volume: {sheetData.productVolume ?? 0}</Text>
                                </View>
                            ) : (
                                <Text style={{ marginTop: 8, color: "gray" }}>Not in progress</Text>
                            )}
                        </>
                    )}

                    {/* 오류 */}
                    {userInfo.isError && !userInfo.isPending && !sheetData && (
                        <View style={{ minHeight: 150, justifyContent: "center", alignItems: "center"}}>
                            <Text style={{ color: "tomato", fontSize: 15 }}>
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