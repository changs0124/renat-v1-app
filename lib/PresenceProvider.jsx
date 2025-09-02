import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useSetAtom } from 'jotai';
import { presenceAtom } from 'atom/locationAtom';
import { Client } from '@stomp/stompjs';
import { socketStatusAtom } from 'atom/presenceAtom';

const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? 'ws://192.168.0.7:8080/ws';

// ✅ RN 권장: webSocketFactory + STOMP 서브프로토콜 명시
function makeStompClient(url) {
    return new Client({
        webSocketFactory: () => new WebSocket(url, ['v12.stomp', 'v11.stomp']),
        forceBinaryWSFrames: true,
        appendMissingNULLonIncoming: true,
        connectHeaders: { host: 'renat-local' },
        reconnectDelay: 5000,
        heartbeatIncoming: 10000,
        heartbeatOutgoing: 10000,
        debug: (msg) => console.log('[STOMP]', msg),
        onWebSocketError: (e) => console.warn('[WS ERROR]', e?.message || e),
        onStompError: (f) => console.warn('[STOMP ERROR]', f?.headers, f?.body),
    });
}

function PresenceProvider({ children }) {
    const setPresence = useSetAtom(presenceAtom);
    const setSocketStatus = useSetAtom(socketStatusAtom);
    const clientRef = useRef(null);
    const pingRef = useRef(null);
    const locationWatchRef = useRef(null);

    const [ready, setReady] = useState(false);
    const [userCode, setUserCode] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const code = await AsyncStorage.getItem('userCode');
                setUserCode(code);
            } finally {
                setReady(true);
            }
        })();
    }, []);

    useEffect(() => {
        if (!ready || !userCode) return;

        setSocketStatus("connecting");

        console.log('[Presence] starting with', { userCode, WS_URL });

        let cancelled = false;

        (async () => {
            // 1회 현재 위치
            let lat = 0, lng = 0;
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status === 'granted') {
                    const { coords } = await Location.getCurrentPositionAsync({});
                    lat = coords.latitude;
                    lng = coords.longitude;
                }
            } catch (e) {
                console.warn('Location error:', e);
            }

            const client = makeStompClient(WS_URL);
            clientRef.current = client;

            client.onConnect = () => {
                if (cancelled) return;
                console.log('[STOMP] CONNECTED ✅');
                setSocketStatus("connected");
                // 서버 브로드캐스트 수신
                client.subscribe('/topic/all', (msg) => {
                    try {
                        const data = JSON.parse(msg.body);
                        if (data.type === 'LEAVE') {
                            setPresence((prev) => {
                                const { [data.userCode]: _, ...rest } = prev;
                                return rest;
                            });
                            return;
                        }
                        setPresence((prev) => ({
                            ...prev,
                            [data.userCode]: {
                                lat: data.latitude ?? prev[data.userCode]?.lat ?? 0,
                                lng: data.longitude ?? prev[data.userCode]?.lng ?? 0,
                                status: data.status ?? prev[data.userCode]?.status ?? 'ONLINE',
                                rtt: data.rtt ?? prev[data.userCode]?.rtt ?? 0,
                                working: (data.status === 'WORKING') || (prev[data.userCode]?.working ?? false),
                            },
                        }));
                    } catch (e) {
                        console.warn('STOMP parse error:', e);
                    }
                });

                // ✅ 로컬 선반영: 화면 즉시 내 위치 찍기
                if (lat && lng) {
                    setPresence((prev) => ({
                        ...prev,
                        [userCode]: {
                            lat, lng,
                            status: 'ONLINE',
                            rtt: prev[userCode]?.rtt ?? 0,
                            working: prev[userCode]?.working ?? false,
                        },
                    }));
                }

                // 접속 알림
                client.publish({
                    destination: '/app/connect',
                    body: JSON.stringify({ userCode, latitude: lat, longitude: lng }),
                });

                // ✅ 이동 감지: 위치 변경 시 /app/update + 로컬 갱신
                (async () => {
                    try {
                        // 기존 워치가 있으면 제거
                        locationWatchRef.current?.remove?.();

                        locationWatchRef.current = await Location.watchPositionAsync(
                            {
                                accuracy: Location.Accuracy.Balanced, // 필요시 High로
                                timeInterval: 4000,                   // 최소 간격(ms)
                                distanceInterval: 5,                  // 최소 이동(m)
                            },
                            (loc) => {
                                const { latitude, longitude } = loc.coords;

                                // 1) 로컬 선반영 → 지도/리스트 즉시 반응
                                setPresence((prev) => ({
                                    ...prev,
                                    [userCode]: {
                                        lat: latitude,
                                        lng: longitude,
                                        status: prev[userCode]?.status ?? 'ONLINE',
                                        rtt: prev[userCode]?.rtt ?? 0,
                                        working: prev[userCode]?.working ?? false,
                                    },
                                }));

                                // 2) 서버로 업데이트 전송
                                if (clientRef.current?.connected) {
                                    clientRef.current.publish({
                                        destination: '/app/update',
                                        body: JSON.stringify({ userCode, latitude, longitude }),
                                    });
                                }
                            }
                        );
                    } catch (e) {
                        console.warn('watchPosition error:', e);
                    }
                })();

                // 주기 ping
                pingRef.current = setInterval(() => {
                    client.publish({
                        destination: '/app/ping',
                        body: JSON.stringify({ userCode, clientTime: Date.now() }),
                    });
                }, 5000);
            };

            client.onWebSocketClose = (e) => console.warn('[WS CLOSED]', e?.code, e?.reason);

            client.activate();
        })();

        // cleanup
        return () => {
            cancelled = true;
            setSocketStatus("disconnected");

            if (pingRef.current) clearInterval(pingRef.current);
            pingRef.current = null;

            // 위치 워치 해제
            locationWatchRef.current?.remove?.();
            locationWatchRef.current = null;

            clientRef.current?.deactivate();
            clientRef.current = null;
        };
    }, [ready, userCode, setPresence]);

    return <>{children}</>;
}

export default PresenceProvider;