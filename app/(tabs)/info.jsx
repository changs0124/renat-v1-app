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

function info(props) {
    return (
        <>
            <Appbar.Header>
                <Appbar.Content title="내 정보" />
                <Appbar.Action icon="cog-outline" onPress={() => { }} />
            </Appbar.Header>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                <Card>
                    <Card.Title
                        title={MY.name}
                        subtitle={`userCode: ${MY.userCode}`}
                        left={(props) => <Avatar.Icon {...props} icon="account" />}
                    />
                    <Card.Content>
                        <View style={{ flexDirection: "row", gap: 18, marginTop: 6 }}>
                            <Text>상태: {MY.status}</Text>
                            <Text>장치: {MY.deviceId}</Text>
                        </View>
                    </Card.Content>
                </Card>
                <Card>
                    <List.Section>
                        <List.Subheader>장치 / 앱 정보</List.Subheader>
                        <Divider />
                        <List.Item title="모델" description={MY.model} left={(p) => <List.Icon {...p} icon="robot-industrial" />} />
                        <List.Item title="앱 버전" description={MY.version} left={(p) => <List.Icon {...p} icon="cellphone" />} />
                        <List.Item title="권한" description="위치, 알림" left={(p) => <List.Icon {...p} icon="shield-key" />} />
                    </List.Section>
                </Card>
                <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
                    <Button mode="outlined" icon="logout" onPress={() => { }}>
                        로그아웃
                    </Button>
                    <Button mode="contained" icon="swap-horizontal" onPress={() => { }}>
                        장치 변경
                    </Button>
                </View>
            </ScrollView>
        </>
    );
}

export default info;