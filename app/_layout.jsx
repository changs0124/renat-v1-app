import 'react-native-gesture-handler';
import 'react-native-reanimated';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { MD3LightTheme, PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const queryClient = new QueryClient()
function _layout() {

  const theme = {
    ...MD3LightTheme,
    colors: {
      ...MD3LightTheme.colors,
      // 브랜드 포인트는 유지
      primary: "#3b82f6",
      secondary: "#10b981",

      // ✅ 연보라 쓰이던 영역을 무채색으로 통일
      // SegmentedButtons/Chip의 '선택됨' 배경 & 텍스트
      secondaryContainer: "#dbdbdb",
      onSecondaryContainer: "#222222",

      // 보조(tertiary) 계열도 회색으로 정리 (가끔 컴포넌트에서 섞여 씀)
      tertiary: "#dbdbdb",
      onTertiary: "#222222",
      tertiaryContainer: "#dbdbdb",
      onTertiaryContainer: "#222222",

      // 카드/서피스 계열(배경/경계) 중 퍼플끼 도는 부분 정리
      surface: "#f6f6f6",
      background: "#f6f6f6",
      surfaceVariant: "#ededed",
      onSurface: "#222222",
      onSurfaceVariant: "#444444",
      outline: "#d0d0d0",
      outlineVariant: "#e2e2e2",

      // 🔹 MD3 'elevation' 레벨별 배경을 회색으로 통일 (Card/ Searchbar 등에 적용)
      elevation: {
        level0: "transparent",
        level1: "#f3f3f3",
        level2: "#eeeeee",   // Searchbar 등 기본 컨테이너
        level3: "#e9e9e9",
        level4: "#e5e5e5",
        level5: "#dbdbdb",   // 가장 진한 회색 레벨
      },
    },
    roundness: 10,
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <QueryClientProvider client={queryClient}>
            <Stack screenOptions={{ headerShown: false }} />
          </QueryClientProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default _layout;
