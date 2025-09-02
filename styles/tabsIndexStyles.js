import { StyleSheet } from "react-native";

export const tabsIndex = StyleSheet.create({
    layout: {
        boxSizing: 'border-box',
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        backgroundColor: '#f2f2f2'
    },
    titleBox: {
        boxSizing: 'border-box',
        display: 'flex',
        width: '100%',
    },
    mapBox: {
        boxSizing: 'border-box',
        display: 'flex',
        width: '100%',
        height: '20%'
    },
    userListBox: {
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #dbdbdb',
        borderRadius: 15,
        width: '100%'
        
    }
})