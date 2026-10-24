// src/screens/common/NotificationsScreen.js
import React, { useCallback, useContext, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import API from '../../api/client';
import { AuthContext } from '../../context/AuthContext';
import { UnreadContext } from '../../context/UnreadContext';
import { useThemeLang, COLORS } from '../../context/ThemeLanguageContext';
import { navigateFromNotificationData } from '../../services/NotificationService';

const TYPE_ICONS = {
  NEW_BID: 'pricetag',
  BID_ACCEPTED: 'checkmark-circle',
  ORDER_CANCELLED: 'close-circle',
  ORDER_STATUS_CHANGED: 'cube',
  NEW_ORDER_POOL: 'navigate-circle',
};

// "2026-10-23 14:05:09" -> "23/10 14:05"
function formatDate(value) {
  if (!value) return '';
  const [date, time = ''] = String(value).split(' ');
  const [, m, d] = date.split('-');
  return `${d}/${m} ${time.slice(0, 5)}`;
}

export default function NotificationsScreen() {
  const { isRTL } = useThemeLang();
  const { user } = useContext(AuthContext);
  const { refreshUnread } = useContext(UnreadContext);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const role =
    user?.current_mode === 'driver' || (!user?.current_mode && user?.role === 'driver')
      ? 'driver'
      : 'customer';

  const load = useCallback(async () => {
    try {
      const res = await API.get('auth.php?action=notifications', { params: { role } });
      if (res.data?.success) setItems(res.data.notifications || []);
    } catch (e) {
      console.log('[Notifications] Chargement :', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [role]);

  useFocusEffect(
    useCallback(() => {
      load();
      refreshUnread();
    }, [load])
  );

  const markRead = async (ids) => {
    try {
      await API.post('auth.php?action=mark_notifications_read', { role, ids });
      refreshUnread();
    } catch (e) {}
  };

  const handlePress = (item) => {
    if (!item.is_read) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: 1 } : n)));
      markRead([item.id]);
    }
    if (item.data) navigateFromNotificationData(item.data);
  };

  const handleMarkAll = () => {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    markRead([]);
  };

  const hasUnread = items.some((n) => !n.is_read);
  const rowDir = isRTL ? 'row-reverse' : 'row';
  const textAlignDir = isRTL ? 'right' : 'left';

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {hasUnread && (
        <TouchableOpacity style={styles.markAllBtn} onPress={handleMarkAll}>
          <Ionicons name="checkmark-done" size={16} color={COLORS.primary} />
          <Text style={styles.markAllText}>
            {isRTL ? 'تحديد الكل كمقروء' : 'Tout marquer comme lu'}
          </Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : { padding: 12 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
              refreshUnread();
            }}
            colors={[COLORS.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="notifications-off-outline" size={44} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>
              {isRTL ? 'لا توجد إشعارات' : 'Aucune notification'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => handlePress(item)}
            style={[styles.card, { flexDirection: rowDir }, !item.is_read && styles.cardUnread]}
          >
            <View style={styles.iconWrap}>
              <Ionicons
                name={TYPE_ICONS[item.type] || 'notifications'}
                size={22}
                color={item.type === 'ORDER_CANCELLED' ? COLORS.danger : COLORS.primary}
              />
            </View>
            <View style={styles.textWrap}>
              <Text style={[styles.title, { textAlign: textAlignDir }]}>{item.title}</Text>
              <Text style={[styles.body, { textAlign: textAlignDir }]}>{item.body}</Text>
              <Text style={[styles.date, { textAlign: textAlignDir }]}>
                {formatDate(item.created_at)}
              </Text>
            </View>
            {!item.is_read && <View style={styles.dot} />}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flexGrow: 1 },
  emptyText: { marginTop: 10, color: COLORS.textMuted, fontWeight: '600' },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  markAllText: { color: COLORS.primary, fontWeight: '700', fontSize: 12, marginLeft: 5 },
  card: {
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardUnread: { borderColor: COLORS.primary, backgroundColor: '#F0FAF5' },
  iconWrap: { width: 40, alignItems: 'center' },
  textWrap: { flex: 1, paddingHorizontal: 6 },
  title: { fontWeight: '800', fontSize: 14, color: COLORS.textDark },
  body: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  date: { fontSize: 11, color: COLORS.textMuted, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.danger },
});
