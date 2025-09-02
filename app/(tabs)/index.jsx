// app/(tabs)/index.jsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { presenceAtom } from "atom/locationAtom";
import { socketStatusAtom } from "atom/presenceAtom";
import { useAtomValue } from "jotai";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, ScrollView } from "react-native";
import MapView, { Marker } from "react-native-maps";
import {
    Appbar,
    Searchbar,
    SegmentedButtons,
    Card,
    Text,
    List,
    Avatar,
    Divider,
    Badge,
    Banner,
    IconButton,
} from "react-native-paper";

// ── 거리 계산 (km) ──
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

const simpleStatus = (s) => (s === "OFFLINE" ? "offline" : "online");

function index() {
    const presence = useAtomValue(presenceAtom);
    const socketStatus = useAtomValue(socketStatusAtom);
    const [userCode, setUserCode] = useState(null);
    console.log('sockectStatus', socketStatus)
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState("all"); // all | online | offline
    const [banner, setBanner] = useState(true);
    const mapRef = useRef(null);

    // 내 userCode 로드
    useEffect(() => {
        AsyncStorage.getItem("userCode").then(setUserCode).catch(() => setUserCode(null));
    }, []);

    // 내 presence
    const me = useMemo(
        () => (userCode ? presence[userCode] : undefined),
        [presence, userCode]
    );

    // 지도 초기 영역 (내 좌표가 있으면 거기로, 없으면 서울 시청)
    const initialRegion = useMemo(() => ({
        latitude: me?.lat ?? 37.5665,
        longitude: me?.lng ?? 126.9780,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
    }), [me?.lat, me?.lng]);

    const centerOnMe = () => {
        if (me?.lat && me?.lng) {
            mapRef.current?.animateToRegion(
                {
                    latitude: me.lat,
                    longitude: me.lng,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                },
                600
            );
        }
    };

    // presence → 사용자 배열 (내 자신 제외) + 거리 계산
    const users = useMemo(() => {
        const entries = Object.entries(presence); // [ [code, {..}], ... ]
        return entries
            .filter(([code]) => code !== userCode)
            .map(([code, p]) => ({
                id: code,
                name: code, // 닉네임 없으면 userCode 노출
                status: simpleStatus(p.status),
                lat: p.lat,
                lng: p.lng,
                distanceKm:
                    me?.lat && me?.lng
                        ? Number(haversine(me.lat, me.lng, p.lat, p.lng).toFixed(2))
                        : null,
            }));
    }, [presence, userCode, me?.lat, me?.lng]);

    // 검색 + 상태 필터
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return users.filter((u) => {
            const okQuery = !q || u.name.toLowerCase().includes(q);
            const okStatus =
                filter === "all"
                    ? true
                    : filter === "online"
                        ? u.status === "online"
                        : u.status === "offline";
            return okQuery && okStatus;
        });
    }, [users, query, filter]);

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
                    >
                        {socketStatus === 'connected' && (me ? "브로커 연결됨 · 내 위치 수신됨" : "브로커 연결됨 · 내 위치 수신 대기")}
                        {socketStatus === 'connecting' && "브로커 연결 중..."}
                        {socketStatus === 'disconnected' && "연결 끊김 · 자동 재연결 시도 중"}
                    </Banner>
                )}

                <Searchbar
                    placeholder="Search User"
                    value={query}
                    onChangeText={setQuery}
                    style={{ marginTop: 4 }}
                />

                <SegmentedButtons
                    value={filter}
                    onValueChange={setFilter}
                    buttons={[
                        { value: "all", label: "전체" },
                        { value: "online", label: "온라인" },
                        { value: "offline", label: "오프라인" },
                    ]}
                    style={{ marginTop: 4 }}
                />

                {/* 지도 */}
                <Card style={{ overflow: "hidden" }}>
                    <View style={{ height: 260 }}>
                        <MapView ref={mapRef} style={{ flex: 1 }} initialRegion={initialRegion}>
                            {/* 내 위치 */}
                            {me?.lat && me?.lng && (
                                <Marker
                                    coordinate={{ latitude: me.lat, longitude: me.lng }}
                                    title="나"
                                    description="내 현재 위치"
                                    pinColor="dodgerblue"
                                />
                            )}

                            {/* 다른 사용자 (필터 반영) */}
                            {filtered.map((u) => (
                                <Marker
                                    key={u.id}
                                    coordinate={{ latitude: u.lat, longitude: u.lng }}
                                    title={u.name}
                                    description={u.distanceKm != null ? `거리 ${u.distanceKm} km` : undefined}
                                    pinColor={u.status === "online" ? "green" : "gray"}
                                />
                            ))}
                        </MapView>

                        {/* 지도 오버레이 버튼 */}
                        <View
                            pointerEvents="box-none"
                            style={{ position: "absolute", top: 10, right: 10, zIndex: 2 }}
                        >
                            <IconButton
                                mode="contained"
                                icon="crosshairs-gps"
                                size={22}
                                onPress={centerOnMe}
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
                        title="주변 사용자"
                        subtitle="상태/검색 필터 적용"
                        style={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 }}
                    />
                    <Divider style={{ marginHorizontal: 10 }} />
                    <View style={{ paddingHorizontal: 10 }}>
                        {filtered
                            .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9))
                            .map((u, idx, arr) => (
                                <View key={u.id}>
                                    <List.Item
                                        title={u.name}
                                        description={
                                            u.distanceKm != null
                                                ? `거리 ${u.distanceKm} km · ${u.status}`
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
                            <Text style={{ paddingVertical: 16, opacity: 0.6 }}>
                                일치하는 사용자가 없습니다.
                            </Text>
                        )}
                    </View>
                </Card>
            </ScrollView>
        </>
    );
}

export default index;