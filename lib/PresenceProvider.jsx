import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useSetAtom } from 'jotai';
import { Client } from '@stomp/stompjs';
import { presenceAtom, socketStatusAtom } from 'atom/presenceAtom';

// 웹소켓 엔드포인트: .env에 없으면 로컬 기본값 사용
const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? 'ws://192.168.0.7:8080/ws';

// RN에서 STOMP를 사용할 때 권장되는 설정을 묶어둔 팩토리 함수
function makeStompClient(url) {
    return new Client({
        // RN은 브라우저 WebSocket이 없으므로 직접 생성해서 전달
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
    const setPresence = useSetAtom(presenceAtom);        // { [userCode]: { lat, lng, status, rtt, working } }
    const setSocketStatus = useSetAtom(socketStatusAtom); // "connecting" | "connected" | "disconnected"

    const clientRef = useRef(null);          // STOMP Client
    const isConnectedRef = useRef(false);    // 연결 상태 플래그(레이스 보완)
    const pingRef = useRef(null);            // ping 타이머
    const locationWatchRef = useRef(null);   // 위치 watch 핸들

    const [ready, setReady] = useState(false);
    const [userCode, setUserCode] = useState(null);

    // 안전 퍼블리시: 연결 확인 + try/catch + 간단 재시도(백오프)
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

    // 마운트 시 1회: 로컬 스토리지에서 userCode 로드
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

    // userCode 준비되면 연결/워치/핑 시작
    useEffect(() => {
        if (!ready || !userCode) return;

        setSocketStatus('connecting');
        console.log('[PRESENCE] Starting with', { userCode, WS_URL });

        let cancelled = false;

        (async () => {
            // 시작 시 현재 위치 1회 조회(권한 포함)
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

            // [ADD] 최초 커넥트 직전, 현재 좌표가 있으면 '내 presence'를 선반영(optimistic update)
            // 서버 스냅샷/델타가 오기 전에도 지도/리스트가 즉시 내 위치를 표시하도록 함
            if (lat != null && lng != null) {
                setPresence((prev) => ({
                    ...prev,
                    [userCode]: {
                        lat,
                        lng,
                        status: prev[userCode]?.status ?? 'ONLINE',
                        rtt: prev[userCode]?.rtt ?? 0,
                        working: prev[userCode]?.working ?? false,
                    },
                }));
            }

            // STOMP 클라이언트 생성
            const client = makeStompClient(WS_URL);
            clientRef.current = client;

            // 연결 성공 콜백
            client.onConnect = () => {
                if (cancelled) return;

                console.log('[STOMP] CONNECTED ✅');
                isConnectedRef.current = true;
                setSocketStatus('connected');

                // [ADD] 연결 직후에도 한 번 더 확정 반영(선반영이 없었던 케이스/권한 지연 대비)
                if (lat != null && lng != null) {
                    setPresence((prev) => ({
                        ...prev,
                        [userCode]: {
                            lat,
                            lng,
                            status: prev[userCode]?.status ?? 'ONLINE',
                            rtt: prev[userCode]?.rtt ?? 0,
                            working: prev[userCode]?.working ?? false,
                        },
                    }));
                }

                // 1) 스냅샷 수신(배열) — @SendToUser("/queue/presence") → 클라 구독은 "/user/queue/presence"
                client.subscribe('/user/queue/presence', (msg) => {
                    try {
                        const arr = JSON.parse(msg.body); // [{ userCode, lat, lng, status, lastPingRtt, working }, ...]
                        const map = {};
                        (arr || []).forEach((p) => {
                            map[p.userCode] = {
                                lat: p.lat,
                                lng: p.lng,
                                status: p.status ?? 'ONLINE',
                                rtt: p.lastPingRtt ?? 0,
                                working: p.working ?? (p.status === 'WORKING'),
                            };
                        });
                        setPresence((prev) => ({ ...prev, ...map }));
                    } catch (e) {
                        console.warn('STOMP snapshot parse error:', e);
                    }
                });

                // 2) delta(단건) 업데이트 — /topic/all
                client.subscribe('/topic/all', (msg) => {
                    try {
                        const data = JSON.parse(msg.body);

                        // LEAVE 이벤트
                        if (data.type === 'LEAVE') {
                            setPresence((prev) => {
                                const { [data.userCode]: _, ...rest } = prev;
                                return rest;
                            });
                            return;
                        }

                        // PRESENCE(단건) 업데이트 — 서버 DTO 필드에 맞게(lat/lng/lastPingRtt/working)
                        setPresence((prev) => {
                            // [NEW-OPTION] 내 에코는 좌표 덮어쓰기 스킵(UX 부드럽게)
                            if (data.userCode === userCode) {
                                const me = prev[userCode] ?? {};
                                return {
                                    ...prev,
                                    [userCode]: {
                                        ...me,
                                        // 좌표는 로컬 선반영 유지(원하면 아래 두 줄 주석 해제해서 서버 권위값으로 동기화)
                                        // lat: data.lat ?? me.lat,
                                        // lng: data.lng ?? me.lng,
                                        status: data.status ?? me.status ?? 'ONLINE',
                                        rtt: data.lastPingRtt ?? me.rtt ?? 0,
                                        working:
                                            (typeof data.working === 'boolean'
                                                ? data.working
                                                : (data.status ? data.status === 'WORKING' : false)),
                                    },
                                };
                            }

                            // 상대방/타 사용자 업데이트
                            return {
                                ...prev,
                                [data.userCode]: {
                                    lat: data.lat ?? prev[data.userCode]?.lat ?? 0,
                                    lng: data.lng ?? prev[data.userCode]?.lng ?? 0,
                                    status: data.status ?? prev[data.userCode]?.status ?? 'ONLINE',
                                    rtt: data.lastPingRtt ?? prev[data.userCode]?.rtt ?? 0,
                                    working:
                                        typeof data.working === 'boolean'
                                            ? data.working
                                            : (data.status === 'WORKING') || (prev[data.userCode]?.working ?? false),
                                },
                            };
                        });
                    } catch (e) {
                        console.warn('STOMP delta parse error:', e);
                    }
                });

                // 초기 publish는 약간 더 길게 지연(타이밍 이슈 회피)
                setTimeout(() => {
                    safePublish('/app/connect', JSON.stringify({ userCode, lat, lng }));
                    safePublish('/app/presence/snapshot', '{}');
                }, 300);

                // 위치 변경 watch 시작
                (async () => {
                    try {
                        // 기존 워치 해제(중복 방지)
                        locationWatchRef.current?.remove?.();

                        locationWatchRef.current = await Location.watchPositionAsync(
                            {
                                accuracy: Location.Accuracy.Balanced,
                                timeInterval: 4000,
                                distanceInterval: 5,
                            },
                            (loc) => {
                                const { latitude, longitude } = loc.coords;

                                // 로컬 즉시 갱신
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

                                // 서버로 전송(세이프)
                                safePublish('/app/update', JSON.stringify({ userCode, lat: latitude, lng: longitude }));
                            }
                        );
                    } catch (e) {
                        console.warn('watchPosition error:', e);
                    }
                })();

                // 주기 ping (세이프)
                pingRef.current = setInterval(() => {
                    safePublish('/app/ping', JSON.stringify({ userCode, clientTime: Date.now() }));
                }, 5000);
            };

            client.onWebSocketClose = (e) => {
                console.warn('[WS CLOSED]', e?.code, e?.reason);
                isConnectedRef.current = false; // 즉시 끔(퍼블리시 가드)
                setSocketStatus('disconnected');

                // 타이머/워치 정리
                if (pingRef.current) clearInterval(pingRef.current);
                pingRef.current = null;
                locationWatchRef.current?.remove?.();
                locationWatchRef.current = null;
            };

            client.activate();
        })();

        // 클린업
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
    }, [ready, userCode, setPresence]);

    return <>{children}</>;
}

export default PresenceProvider;