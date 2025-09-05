import React from 'react';
import { Appbar } from 'react-native-paper';

function TabHeader({ title, icon, onPress }) {
    return (
        <Appbar.Header>
            <Appbar.Content title={title} titleStyle={{ fontSize: 18, fontWeight: "600" }} />
            {
                !!icon &&
                <Appbar.Action icon={icon} onPress={!!onPress ? onPress : () => { }} size={25} />
            }
        </Appbar.Header>
    );
}

export default TabHeader;