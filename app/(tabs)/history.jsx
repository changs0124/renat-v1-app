import React, { useState } from "react";
import { View, ScrollView } from "react-native";
import {
    Appbar,
    TextInput,
    Button,
    Card,
    Text,
    Chip,
    Divider,
    List,
} from "react-native-paper";

const RECENT = ["A동 3층", "포장실", "B창고 2열"];
const SAMPLE_ROUTES = [
    { id: "r1", from: "현재 위치", to: "A동 3층", item: "팔레트 2EA", distanceKm: 1.2, etaMin: 8 },
    { id: "r2", from: "현재 위치", to: "포장실", item: "BOX 4EA", distanceKm: 0.6, etaMin: 4 },
];

function history() {
    const [dest, setDest] = useState("");
    const [item, setItem] = useState("");
    const [loading, setLoading] = useState(false);

    const onSearch = () => {
        setLoading(true);
        setTimeout(() => setLoading(false), 700); // 데모
    };
    return (
        <>
            <Appbar.Header>
                <Appbar.Content title="History / Paths" />
            </Appbar.Header>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                <Card>
                    <Card.Content style={{ gap: 12 }}>
                        <TextInput
                            label="Cargo"
                            placeholder="예) A동 3층"
                            value={dest}
                            onChangeText={setDest}
                            left={<TextInput.Icon icon="map-marker" />}
                        />
                        <TextInput
                            label="Product"
                            placeholder="예) 팔레트 2EA"
                            value={item}
                            onChangeText={setItem}
                            left={<TextInput.Icon icon="package-variant-closed" />}
                        />
                        <Button mode="contained" onPress={onSearch} loading={loading}>
                            View paths
                        </Button>
                    </Card.Content>
                </Card>

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {RECENT.map((t) => (
                        <Chip key={t} icon="history" onPress={() => setDest(t)}>
                            {t}
                        </Chip>
                    ))}
                </View>

                <Card>
                    <Card.Title title="Search results" />
                    <Divider />
                    {SAMPLE_ROUTES.map((r, idx) => (
                        <View key={r.id}>
                            <List.Item
                                title={`${r.from} → ${r.to}`}
                                description={`${r.item} · ${r.distanceKm}km · 약 ${r.etaMin}분`}
                                left={(props) => <List.Icon {...props} icon="route" />}
                                onPress={() => { }}
                            />
                            {idx < SAMPLE_ROUTES.length - 1 && <Divider />}
                        </View>
                    ))}
                </Card>
            </ScrollView>
        </>
    );
}

export default history;