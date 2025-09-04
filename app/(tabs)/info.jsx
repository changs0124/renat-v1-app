import { useQuery } from "@tanstack/react-query";
import { instance } from "apis/instance";
import { userCodeAtom } from "atom/userAtom";
import { useAtomValue } from "jotai";
import React from "react";
import { ScrollView, View } from "react-native";
import {
    Appbar,
    Card,
    Avatar,
    Text,
    List,
    Divider,
    Button,
} from "react-native-paper";

const MY = {
    name: "Seong",
    userCode: "U-1023",
    deviceId: "D-5502",
    status: "idle",
    model: "Forklift-12K",
    version: "v0.9.1",
};

function info() {
    const userCode = useAtomValue(userCodeAtom);

    const myInfo = useQuery({
        queryKey: ["myInfo", userCode],
        queryFn: async () => await instance.get(`/user/my/${userCode}`).then(res => res.data),
        enabled: !!userCode,
        retry: 0,
        refetchOnWindowFocus: true
    })

    return (
        <>
            <Appbar.Header>
                <Appbar.Content title="Info" />
                <Appbar.Action icon="cog-outline" onPress={() => { }} />
            </Appbar.Header>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                <Card>
                    <Card.Title
                        title={myInfo?.data?.userName}
                        subtitle={`userCode: ${userCode}`}
                        left={(props) => <Avatar.Icon {...props} icon="account" />}
                    />
                </Card>
                <Card>
                    <List.Section>
                        <List.Subheader>Model / App Info</List.Subheader>
                        <Divider />
                        <List.Item title="Model" description={myInfo?.data?.modelNumber} left={(p) => <List.Icon {...p} icon="robot-industrial" />} />
                        <List.Item title="App Versopm" description="v0.9.1" left={(p) => <List.Icon {...p} icon="cellphone" />} />
                        <List.Item title="Authentication" description="Location, Notifications" left={(p) => <List.Icon {...p} icon="shield-key" />} />
                    </List.Section>
                </Card>
                <View style={{ justifyContent: "flex-end", flexDirection: "row", gap: 12, marginTop: 4 }}>
                    <Button mode="outlined" icon="logout" onPress={() => { }}>
                        Logout
                    </Button>
                    <Button mode="contained" icon="swap-horizontal" onPress={() => { }}>
                        Change Device
                    </Button>
                </View>
            </ScrollView>
        </>
    );
}

export default info;