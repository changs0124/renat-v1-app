import { useState, useEffect } from "react";
import { View, StyleSheet, KeyboardAvoidingView, TouchableWithoutFeedback, Platform, Keyboard, Alert } from "react-native";
import { Card, TextInput, Button, Menu, ActivityIndicator, Appbar } from "react-native-paper";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { registerStyles } from "styles/registerStyles";
import { instance } from "apis/instance";
import uuid from 'react-native-uuid';
import * as Location from 'expo-location';
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "userCode";

function register() {
    const [userName, setUserName] = useState("");
    const [modelId, setModelId] = useState(0);

    const [visible, setVisible] = useState(false);

    const models = useQuery({
        queryKey: ["models"],
        queryFn: async () => instance.get("/models").then(res => res.data),
        enabled: true,
        retry: 0,
        refetchOnWindowFocus: true,
    })

    useEffect(() => {
        if (models?.data?.length > 0 && modelId === 0) {
            setModelId(models?.data[0].id);
        }
    }, [models.isSuccess]);

    const register = useMutation({
        mutationFn: async ({ userName }) => {
            const { status } = await Location.requestForegroundPermissionsAsync();

            if (status !== "granted") throw new Error("Location permission denied.");

            const userCode = uuid.v4().toString();
            const location = await Location.getCurrentPositionAsync({});
            const { latitude, longitude } = location.coords;
        
            await instance.post("/user", {
                userCode,
                userName,
                modelId,
                latitude,
                longitude
            })
            return userCode
        },
        onSuccess: async (userCode) => {
            await AsyncStorage.setItem(STORAGE_KEY, userCode);

            Alert.alert("Register Success")
            router.replace("/")
        },
        onError: (err) => {
            Alert.alert(err?.response?.data?.message)
        }
    })

    return (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                <View style={registerStyles.layout}>
                    <Card style={registerStyles.card}>
                        <Card.Title title="Register User" subtitle="Select a name and device" />
                        <Card.Content>
                            <TextInput
                                label="UserName"
                                value={userName}
                                onChangeText={setUserName}
                                mode="outlined"
                                style={registerStyles.input}
                            />
                            <Menu
                                visible={visible}
                                onDismiss={() => setVisible(false)}
                                anchor={
                                    <Button
                                        mode="outlined"
                                        onPress={() => setVisible(true)}
                                        style={registerStyles.input}
                                    >
                                        {models?.data?.find(m => m.id === modelId)?.modelNumber || "Select the model"}
                                    </Button>
                                }
                            >
                                {
                                    models?.isError &&
                                    <Menu.Item onPress={() => models.refetch()} title="Load failed (try again)" />
                                }
                                {
                                    models?.isLoading &&
                                    <ActivityIndicator style={{ margin: 8 }} />
                                }
                                {
                                    models?.data?.map(m =>
                                        <Menu.Item
                                            key={m.id}
                                            onPress={() => {
                                                setModelId(m.id);
                                                setVisible(false);
                                            }}
                                            title={m.modelNumber}
                                        />
                                    )
                                }
                            </Menu>
                        </Card.Content>
                        <Card.Actions>
                            <Button
                                mode="contained"
                                disabled={!userName || !modelId}
                                onPress={() => register.mutateAsync({ userName: userName.trim() }).catch(() => { })}
                            >
                                Register
                            </Button>
                        </Card.Actions>
                    </Card>
                </View>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
    );
}

export default register;