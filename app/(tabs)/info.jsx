import { useQuery } from "@tanstack/react-query";
import { instance } from "apis/instance";
import { userCodeAtom } from "atom/userAtom";
import TabHeader from "components/TabHeader/TabHeader";
import { useAtomValue } from "jotai";
import { ScrollView, View } from "react-native";
import { Appbar, Card, Avatar, Text, List, Divider, Button, } from "react-native-paper";

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
            <TabHeader title={"Info"} icon={"cog-outline"}/>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                <Card style={{ borderRadius: 16 }}>
                    <Card.Title
                        title={myInfo?.data?.userName}
                        subtitle={`code: ${userCode}`}
                        left={(props) => <Avatar.Icon {...props} icon="account" />}
                        style={{ minHeight: 100 }}
                        titleStyle={{ fontSize: 18, fontWeight: "600" }}
                        subtitleStyle={{ fontSize: 14, fontWeight: "400" }}
                    />
                </Card>
                <Card style={{ borderRadius: 16 }}>
                    <List.Section>
                        <List.Subheader style={{ fontSize: 18, fontWeight: "600" }}>Model / App Info</List.Subheader>
                        <Divider style={{ marginHorizontal: 10 }}/>
                        <List.Item
                            title="Model"
                            description={myInfo?.data?.modelNumber}
                            left={(p) => <List.Icon {...p} icon="robot-industrial" />}
                            titleStyle={{ fontSize: 16, fontWeight: "600" }}
                            descriptionStyle={{ fontSize: 14, fontWeight: "400" }}
                        />
                        <List.Item
                            title="App Versopm"
                            description="v0.9.1"
                            left={(p) => <List.Icon {...p} icon="cellphone" />}
                            titleStyle={{ fontSize: 16, fontWeight: "600" }}
                            descriptionStyle={{ fontSize: 14, fontWeight: "400" }}
                        />
                        <List.Item
                            title="Authentication"
                            description="Location, Notifications"
                            left={(p) => <List.Icon {...p} icon="shield-key" />}
                            titleStyle={{ fontSize: 16, fontWeight: "600" }}
                            descriptionStyle={{ fontSize: 14, fontWeight: "400" }}
                        />
                    </List.Section>
                </Card>
                <View style={{ justifyContent: "flex-end", flexDirection: "column", gap: 12, marginTop: 4 }}>
                    <Button
                        mode="outlined"
                        icon="logout"
                        onPress={() => { }}
                        labelStyle={{ fontSize: 16, fontWeight: "600" }}
                    >
                        Delete Account
                    </Button>
                    <Button
                        mode="contained"
                        icon="swap-horizontal"
                        onPress={() => { }}
                        labelStyle={{ fontSize: 16, fontWeight: "600" }}
                    >
                        Change Device
                    </Button>
                </View>
            </ScrollView>
        </>
    );
}

export default info;