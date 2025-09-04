import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import PresenceProvider from 'lib/PresenceProvider';

function _layout() {
    return (
        <PresenceProvider>
            <Tabs
                screenOptions={({ route }) => ({
                    headerShown: false,
                    tabBarActiveTintColor: "#3b82f6",
                    tabBarInactiveTintColor: "gray",
                    tabBarStyle: { backgroundColor: "white" }, // 필요 없으면 제거
                    tabBarLabelStyle: { fontSize: 12 },
                    tabBarHideOnKeyboard: true,
                    tabBarIcon: ({ color, size, focused }) => {
                        let iconName = "ellipse-outline";
                        if (route.name === "index") {
                            iconName = focused ? "home" : "home-outline";
                        } else if (route.name === "history") {
                            iconName = focused ? "time" : "time-outline";
                        } else if (route.name === "job") {
                            iconName = focused ? "play-circle" : "play-circle-outline";
                        } else if (route.name === "info") {
                            iconName = focused ? "information-circle" : "information-circle-outline";
                        }
                        return <Ionicons name={iconName} size={size} color={color} />;
                    },
                })}
            >
                <Tabs.Screen name="index" options={{ title: "Home" }} />
                <Tabs.Screen name="history" options={{ title: "History" }} />
                <Tabs.Screen name="job" options={{ title: "Job" }} />
                <Tabs.Screen name="info" options={{ title: "Info" }} />
            </Tabs>
        </PresenceProvider>
    );
}

export default _layout;
