import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { Redirect, Link, router } from "expo-router";
import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { instance } from "../apis/instance";
import { Button } from "react-native-paper";
import { useAtom } from "jotai";
import { userCodeAtom } from "atom/userAtom";

function index() {
    const [userCode, setUserCode] = useAtom(userCodeAtom);

    const [isChecked, setIsChecked] = useState(false);

    useEffect(() => {
        console.log("[INDEX] Mounted");
        (async () => {
            const code = await AsyncStorage.getItem("userCode");
            console.log("[INDEX] UserCode from Storage =", code);
            setUserCode(code);
            setIsChecked(true);
        })();
    }, []);

    const auth = useQuery({
        queryKey: ["auth", userCode],
        queryFn: async () => {
            const res = await instance.get(`/user/${userCode}`);
            return res.data;
        },
        enabled: isChecked && !!userCode,
        retry: 0,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true
    });

    if (!isChecked) {
        console.log("[INDEX] Waiting Storage");
        return (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 15 }}>Waiting Storage</Text>
            </View>
        );
    }

    if (!userCode) {
        console.log("[INDEX] No UserCode");

        return <Redirect href="/register" />;
    }

    if (auth.isLoading) {
        console.log("[INDEX] Auth is Loading");

        return (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 15 }}>Auth is Loading</Text>
            </View>
        );
    }

    // 네트워크/서버 오류 시 임시 화면
    if (auth.isError) {
        const status = auth?.error?.response?.status;
        console.log("[INDEX] Auth Error Status =", status);

        if (status === 404) {
            AsyncStorage.removeItem("userCode").catch(() => { });

            console.log("[INDEX] Invalid UserCode");
            return <Redirect href="/register" />;
        }

        return (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ paddingBottom: 15, fontSize: 15 }}>Auth error. Check server.</Text>
                <Button mode="contained" onPress={() => { router.push("/register") }} style={{ fontSize: 15 }}>
                    Go register
                </Button>
            </View>
        );
    }

    if (auth.isSuccess && auth?.data) {
        console.log("[INDEX] Auth is TRUE");

        return <Redirect href="/(tabs)" />
    } else {
        console.log("[INDEX] Auth is FALSE");

        return <Redirect href="/register" />;
    }
}

export default index;
