import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useSetAtom } from 'jotai';
import { Client } from '@stomp/stompjs';
import { presenceAtom, publishAtom, setWorkingAtom, socketStatusAtom } from 'atom/presenceAtom';

// 웹소켓 엔드포인트: .env에 없으면 로컬 기본값 사용
const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? 'ws://222.234.4.177:8081/ws';

// STOMP 클라이언트 팩토리
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
    const setPublish = useSetAtom(publishAtom);
    const setWorkingFn = useSetAtom(setWorkingAtom);

    const clientRef = useRef(null);
    const isConnectedRef = useRef(false);
    const pingRef = useRef(null);
    const locationWatchRef = useRef(null);

    const [ready, setReady] = useState(false);
    const [userCode, setUserCode] = useState(null);
    const [userName, setUserName] = useState(null);

    // 안전 퍼블리시
    const safePublish = (destination, body, attempt = 0) => {
        const client = clientRef.current;
        if (!client || !isConnectedRef.current || !client.connected) {
            if (attempt < 3) {
                setTimeout(() => safePublish(destination, body, attempt + 1), 150 * (attempt + 1));
            } else {
                console.warn('[PUBLISH DROPPED] not connected:', destination);
            }
            return;
        }
        try {
            client.publish({ destination, body });
        } catch (err) {
            console.warn('[PUBLISH ERROR]', err?.message || err);
            if (attempt < 3) {
                setTimeout(() => safePublish(destination, body, attempt + 1), 200 * (attempt + 1));
            }
        }
    };

    // working helper
    const setWorking = (userCode, working) => {
        safePublish("/app/working", JSON.stringify({ userCode, working }));
        setPresence(prev => ({
            ...prev,
            [userCode]: { ...prev[userCode], working }
        }));
    };

    useEffect(() => {
        setPublish(() => safePublish);
        setWorkingFn(() => setWorking);
    }, []);

    // AsyncStorage에서 userCode, userName 로드
    useEffect(() => {
        (async () => {
            try {
                const code = await AsyncStorage.getItem('userCode');
                const name = await AsyncStorage.getItem('userName');
                setUserCode(code);
                setUserName(name && name.trim().length > 0 ? name : (code || null));
            } finally {
                setReady(true);
            }
        })();
    }, []);

    // 연결/워치/핑
    useEffect(() => {
        if (!ready || !userCode) return;

        setSocketStatus('connecting');
        console.log('[PRESENCE] Starting with', { userCode, userName, WS_URL });

        let cancelled = false;

        (async () => {
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

            // 선반영
            if (lat != null && lng != null) {
                setPresence(prev => ({
                    ...prev,
                    [userCode]: {
                        userCode,
                        userName,
                        lat,
                        lng,
                        rtt: prev[userCode]?.rtt ?? 0,
                        working: prev[userCode]?.working ?? false,
                    },
                }));
            }

            const client = makeStompClient(WS_URL);
            clientRef.current = client;

            client.onConnect = () => {
                if (cancelled) return;

                console.log('[STOMP] CONNECTED ✅');
                isConnectedRef.current = true;
                setSocketStatus('connected');

                // 재반영
                if (lat != null && lng != null) {
                    setPresence(prev => ({
                        ...prev,
                        [userCode]: {
                            userCode,
                            userName,
                            lat,
                            lng,
                            rtt: prev[userCode]?.rtt ?? 0,
                            working: prev[userCode]?.working ?? false,
                        },
                    }));
                }

                // 1) snapshot
                client.subscribe('/user/queue/presence', (msg) => {
                    try {
                        const arr = JSON.parse(msg.body);
                        const map = {};
                        (arr || []).forEach((p) => {
                            map[p.userCode] = {
                                userCode: p.userCode,
                                userName: p.userName ?? p.userCode,
                                lat: p.lat,
                                lng: p.lng,
                                rtt: p.rtt ?? 0,
                                working: !!p.working,
                            };
                        });
                        setPresence(prev => ({ ...prev, ...map }));
                    } catch (e) {
                        console.warn('STOMP snapshot parse error:', e);
                    }
                });

                // 2) delta
                client.subscribe('/topic/all', (msg) => {
                    try {
                        const data = JSON.parse(msg.body);

                        if (data.type === 'LEAVE') {
                            setPresence(prev => {
                                const { [data.userCode]: _, ...rest } = prev;
                                return rest;
                            });
                            return;
                        }

                        setPresence(prev => {
                            if (data.userCode === userCode) {
                                const me = prev[userCode] ?? {};
                                return {
                                    ...prev,
                                    [userCode]: {
                                        ...me,
                                        userCode,
                                        userName: data.userName ?? userName ?? userCode,
                                        rtt: data.rtt ?? me.rtt ?? 0,
                                        working: typeof data.working === 'boolean' ? data.working : me.working ?? false,
                                    },
                                };
                            }

                            return {
                                ...prev,
                                [data.userCode]: {
                                    userCode: data.userCode,
                                    userName: data.userName ?? prev[data.userCode]?.userName ?? data.userCode,
                                    lat: data.lat ?? prev[data.userCode]?.lat ?? 0,
                                    lng: data.lng ?? prev[data.userCode]?.lng ?? 0,
                                    rtt: data.rtt ?? prev[data.userCode]?.rtt ?? 0,
                                    working: typeof data.working === 'boolean' ? data.working : prev[data.userCode]?.working ?? false,
                                },
                            };
                        });
                    } catch (e) {
                        console.warn('STOMP delta parse error:', e);
                    }
                });

                // 초기 connect
                setTimeout(() => {
                    safePublish('/app/connect', JSON.stringify({ userCode, userName, lat, lng }));
                    safePublish('/app/presence/snapshot', '{}');
                }, 300);

                // 위치 watch
                (async () => {
                    try {
                        locationWatchRef.current?.remove?.();
                        locationWatchRef.current = await Location.watchPositionAsync(
                            {
                                accuracy: Location.Accuracy.Balanced,
                                timeInterval: 4000,
                                distanceInterval: 5,
                            },
                            (loc) => {
                                const { latitude, longitude } = loc.coords;

                                setPresence(prev => ({
                                    ...prev,
                                    [userCode]: {
                                        userCode,
                                        userName: prev[userCode]?.userName ?? userName ?? userCode,
                                        lat: latitude,
                                        lng: longitude,
                                        rtt: prev[userCode]?.rtt ?? 0,
                                        working: prev[userCode]?.working ?? false,
                                    },
                                }));

                                safePublish('/app/update', JSON.stringify({ userCode, userName, lat: latitude, lng: longitude }));
                            }
                        );
                    } catch (e) {
                        console.warn('watchPosition error:', e);
                    }
                })();

                // ping
                pingRef.current = setInterval(() => {
                    safePublish('/app/ping', JSON.stringify({ userCode, userName, clientTime: Date.now() }));
                }, 5000);
            };

            client.onWebSocketClose = (e) => {
                console.warn('[WS CLOSED]', e?.code, e?.reason);
                isConnectedRef.current = false;
                setSocketStatus('disconnected');

                if (pingRef.current) clearInterval(pingRef.current);
                pingRef.current = null;
                locationWatchRef.current?.remove?.();
                locationWatchRef.current = null;
            };

            client.activate();
        })();

        return () => {
            cancelled = true;
            setSocketStatus('disconnected');
            isConnectedRef.current = false;

            if (pingRef.current) clearInterval(pingRef.current);
            pingRef.current = null;

            locationWatchRef.current?.remove?.();
            locationWatchRef.current = null;

            clientRef.current?.deactivate();
            clientRef.current = null;
        };
    }, [ready, userCode, userName, setPresence, setSocketStatus]);

    return <>{children}</>;
}

export default PresenceProvider;
