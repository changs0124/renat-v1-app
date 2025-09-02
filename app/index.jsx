import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { Redirect, Link, router, useFocusEffect } from "expo-router";
import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { instance } from "../apis/instance";
import { Button } from "react-native-paper";

function index() {
    const [userCode, setUserCode] = useState(null);
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        console.log("[Index] Mounted");

        (async () => {
            const code = await AsyncStorage.getItem("userCode");
            console.log("[Index] UserCode from Storage =", code);
            setUserCode(code);
            setChecked(true);
        })();
    }, []);

    const auth = useQuery({
        queryKey: ["auth", userCode],
        queryFn: async () => {
            const res = await instance.get(`/user/${userCode}`);
            return res.data;
        },
        enabled: !!userCode,
        retry: 0,
        refetchOnWindowFocus: false,
    });

    useFocusEffect(React.useCallback(() => {
        auth.refetch(); // 탭으로 돌아올 때마다 재검증
    }, [auth]))

    if (!checked) {
        console.log("[Index] Waiting Storage");
        return (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 15 }}>Waiting Storage</Text>
            </View>
        );
    }

    if (!userCode) {
        console.log("[Index] No UserCode");
        return <Redirect href="/register" />;
    }

    if (auth.isLoading) {
        console.log("[Index] Auth is Loading");
        return (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 15 }}>Auth is Loading</Text>
            </View>
        );
    }

    // 네트워크/서버 오류 시 임시 화면
    if (auth.isError) {
        const status = auth?.error?.response?.status;
        console.log("[Index] Auth Error Status =", status);

        if (status === 404) {
            AsyncStorage.removeItem("userCode").catch(() => { });

            console.log("[Index] Invalid UserCode");
            return <Redirect href="/register" />;
        }

        return (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ paddingBottom: 15, fontSize: 15 }}>Auth error. Check server.</Text>
                <Button
                    mode="contained"
                    onPress={() => { router.push("/register") }}
                    style={{ fontSize: 15 }}
                >
                    Go register
                </Button>
            </View>
        );
    }

    if (auth.isSuccess && auth?.data) {
        console.log("[Index] Auth is TRUE");
        return <Redirect href="/(tabs)" />
    } else {
        console.log("[Index] Auth is FALSE");
        return <Redirect href="/register" />;
    }
}

export default index;
