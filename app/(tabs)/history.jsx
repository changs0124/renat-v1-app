import { useMutation, useQuery } from "@tanstack/react-query";
import { instance } from "apis/instance";
import { userCodeAtom } from "atom/userAtom";
import TabHeader from "components/TabHeader/TabHeader";
import { useAtomValue } from "jotai";
import React, { useCallback, useMemo, useState } from "react";
import { View, ScrollView } from "react-native";
import { TextInput, Button, Card, Text, Chip, Divider, List, Menu, ActivityIndicator } from "react-native-paper";

const RECENT = ["A동 3층", "포장실", "B창고 2열"];
const SAMPLE_ROUTES = [
    { id: "r1", from: "현재 위치", to: "A동 3층", item: "팔레트 2EA", distanceKm: 1.2, etaMin: 8 },
    { id: "r2", from: "현재 위치", to: "포장실", item: "BOX 4EA", distanceKm: 0.6, etaMin: 4 },
];

function history() {
    const userCode = useAtomValue(userCodeAtom);
    const [cargoId, setCargoId] = useState(null);
    const [productId, setProductId] = useState(null);

    const [cargoMenuVisible, setCargoMenuVisible] = useState(false);
    const [productMenuVisible, setProductMenuVisible] = useState(false);

    const [dest, setDest] = useState("");
    const [item, setItem] = useState("");
    const [loading, setLoading] = useState(false);

    const cargos = useQuery({
        queryKey: ["cargos"],
        queryFn: async () => await instance.get("/cargos").then(res => res.data),
        enabled: !!userCode,
        refetchOnWindowFocus: true,
        retry: 0
    });

    const products = useQuery({
        queryKey: ["products"],
        queryFn: async () => await instance.get("/products").then(res => res.data),
        enabled: !!userCode,
        refetchOnWindowFocus: true,
        retry: 0
    });

    const topCargos = useQuery({
        queryKey: ["topCargos"],
        queryFn: async () => await instance.get("/cargos/top").then(res => res.data),
        enabled: !!userCode,
        refetchOnWindowFocus: true,
        retry: 0
    })

    const cargoList = Array.isArray(cargos.data) ? cargos.data : [];
    const topCargoList = Array.isArray(topCargos.data) ? topCargos.data : [];
    const productList = Array.isArray(products.data) ? products.data : [];

    const selectedCargo = useMemo(() => cargoList.find((c) => c.id === cargoId), [cargoList, cargoId]);
    const selectedProduct = useMemo(() => productList.find((p) => p.id === productId), [productList, productId]);

    const handleCargoChange = useCallback((id) => {
        setCargoId(id);
        setCargoMenuVisible(false);
    }, []);

    const handleProductChange = useCallback((id) => {
        setProductId(id);
        setProductMenuVisible(false);
    }, []);

    const onSearch = () => {
        setLoading(true);
        setTimeout(() => setLoading(false), 700); // 데모
    };

    const getHistorys = useMutation({
        mutationFn: async () => {
            const params = {};
            if (cargoId != null && cargoId !== 0) params.cargoId = cargoId;
            if (productId != null && productId !== 0) params.productId = productId;

            return instance.get("/historys", { params }).then(res => res?.data);
        },
        onSuccess: (res) => {
            console.log("[HISTORY]", res)
        },
        onError: (err) => {
            console.log("[HISTORY] Error")
        }
    })

    return (
        <>
            <TabHeader title={"History & Paths"} />
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                <Card style={{ borderRadius: 16 }}>
                    <Card.Content style={{ gap: 12 }}>
                        <Text variant="labelLarge" style={{ opacity: 0.8, fontSize: 18, fontWeight: "600" }}>Cargo</Text>
                        <Menu
                            visible={cargoMenuVisible}
                            onDismiss={() => setCargoMenuVisible(false)}
                            anchor={
                                <Button
                                    mode="outlined"
                                    onPress={() => setCargoMenuVisible(true)}
                                    disabled={cargos.isLoading || cargos.isError}
                                    style={{ marginBottom: 4, borderRadius: 16 }}
                                    labelStyle={{ fontSize: 16, fontWeight: "600" }}
                                >
                                    {selectedCargo?.cargoName ?? "Select the Cargo"}
                                </Button>
                            }
                        >
                            {
                                cargos.isLoading &&
                                <ActivityIndicator style={{ margin: 8 }} />
                            }
                            {
                                cargos.isError &&
                                <Menu.Item onPress={() => cargos.refetch()} title="Load failed (try again)" />
                            }
                            {
                                cargoList.map((c, idx) =>
                                    <React.Fragment key={c.id}>
                                        <Menu.Item
                                            onPress={() => handleCargoChange(c.id)}
                                            title={c.cargoName ?? `Cargo #${c.id}`}
                                            titleStyle={{ opacity: 0.8, fontSize: 14, fontWeight: "600" }}
                                            style={{ paddingVertical: 4 }}
                                        />
                                        {idx < cargoList.length - 1 && <Divider />}
                                    </React.Fragment>
                                )}
                        </Menu>
                        <Text variant="labelLarge" style={{ opacity: 0.8, fontSize: 18, fontWeight: "600" }}>Product</Text>
                        <Menu
                            visible={productMenuVisible}
                            onDismiss={() => setProductMenuVisible(false)}
                            anchor={
                                <Button
                                    mode="outlined"
                                    onPress={() => setProductMenuVisible(true)}
                                    disabled={products.isLoading || products.isError}
                                    style={{ marginBottom: 4, borderRadius: 16 }}
                                    labelStyle={{ fontSize: 16, fontWeight: "600" }}
                                >
                                    {selectedProduct?.productName ?? "Select the Product"}
                                </Button>
                            }
                        >
                            {
                                products.isLoading &&
                                <ActivityIndicator style={{ margin: 8 }} />
                            }
                            {
                                products.isError &&
                                <Menu.Item onPress={() => products.refetch()} title="Load failed (try again)" />
                            }
                            {
                                productList.map((p, idx) =>
                                    <React.Fragment key={p.id}>
                                        <Menu.Item
                                            onPress={() => handleProductChange(p.id)}
                                            title={p.productName ?? `Product #${p.id}`}
                                            titleStyle={{ opacity: 0.8, fontSize: 14, fontWeight: "600" }}
                                            style={{ paddingVertical: 4 }}
                                        />
                                        {idx < productList.length - 1 && <Divider />}
                                    </React.Fragment>
                                )
                            }
                        </Menu>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                            {
                                topCargoList.map(cargo =>
                                    <Chip key={cargo.id} icon="history" onPress={() => handleCargoChange(cargo.id)}>
                                        {cargo.cargoName}
                                    </Chip>
                                )
                            }
                        </View>
                        <Button
                            mode="contained"
                            onPress={() => getHistorys.mutateAsync().catch(() => { })}
                            style={{ marginBottom: 4 }}
                            labelStyle={{ fontSize: 16, fontWeight: "600" }}
                        >
                            Search
                        </Button>
                    </Card.Content>
                </Card >
                {/* <Card>
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
                </Card> */}
            </ScrollView>
        </>
    );
}

export default history;