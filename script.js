// script.js - إدارة تفاعل الطلبات وتحديث بيانات التحليلات
(function () {
    const STORAGE_KEY = 'boostly-analytics';
    const ANALYTICS_URL = '/analytics.json';
    const WHATSAPP_NUMBER = '96560930205';

    const normalisePrice = (priceText) => {
        if (typeof priceText === 'number') {
            return priceText;
        }
        if (!priceText) {
            return 0;
        }
        const cleaned = String(priceText).replace(/[^\d.,]/g, '').replace(/,/g, '.');
        const value = parseFloat(cleaned);
        return Number.isFinite(value) ? value : 0;
    };

    const loadAnalyticsFromStorage = () => {
        try {
            const stored = window.localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : null;
        } catch (error) {
            console.warn('تعذر قراءة بيانات التحليلات من التخزين المحلي', error);
            return null;
        }
    };

    const persistAnalytics = (analytics) => {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(analytics));
            window.dispatchEvent(new CustomEvent('analytics-updated', { detail: analytics }));
        } catch (error) {
            console.warn('تعذر حفظ بيانات التحليلات', error);
        }
    };

    const seedAnalyticsIfNeeded = async () => {
        if (loadAnalyticsFromStorage()) {
            return;
        }
        try {
            const response = await fetch(ANALYTICS_URL, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error('فشل في تحميل ملف التحليلات المبدئي');
            }
            const data = await response.json();
            persistAnalytics(data);
        } catch (error) {
            console.warn('تعذر تهيئة بيانات التحليلات المبدئية', error);
        }
    };

    const ensureDailyTrendEntry = (analytics, isoDate, label, orderValue) => {
        analytics.dailyTrends = analytics.dailyTrends || [];
        const existingEntry = analytics.dailyTrends.find((entry) => entry.date === isoDate);
        if (existingEntry) {
            existingEntry.orders = (existingEntry.orders || 0) + 1;
            existingEntry.visits = (existingEntry.visits || 0) + 3;
            existingEntry.sales = Number(((existingEntry.sales || 0) + orderValue).toFixed(2));
        } else {
            analytics.dailyTrends.push({
                date: isoDate,
                label,
                visits: 3,
                orders: 1,
                sales: Number(orderValue.toFixed(2))
            });
        }
        analytics.dailyTrends.sort((a, b) => new Date(a.date) - new Date(b.date));
        if (analytics.dailyTrends.length > 14) {
            analytics.dailyTrends = analytics.dailyTrends.slice(-14);
        }
    };

    const recordOrder = ({ platform, packageName, price, customerName = 'عميل عبر الموقع', source = 'موقع Boostly' }) => {
        const analytics = loadAnalyticsFromStorage();
        if (!analytics) {
            console.warn('لا توجد بيانات تحليلية لكتابتها، سيتم محاولة تهيئتها أولاً.');
            seedAnalyticsIfNeeded();
            return;
        }

        const priceValue = normalisePrice(price);
        const now = new Date();
        const isoDate = now.toISOString().slice(0, 10);
        const label = now.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
        const orderId = `ORD-${isoDate.replace(/-/g, '')}-${now.getHours().toString().padStart(2, '0')}${now
            .getMinutes()
            .toString()
            .padStart(2, '0')}`;

        analytics.metrics = analytics.metrics || {};
        analytics.metrics.orders = (analytics.metrics.orders || 0) + 1;
        analytics.metrics.sales = Number(((analytics.metrics.sales || 0) + priceValue).toFixed(2));
        analytics.metrics.visits = (analytics.metrics.visits || 0) + 3;
        analytics.metrics.avgOrderValue = analytics.metrics.orders
            ? Number((analytics.metrics.sales / analytics.metrics.orders).toFixed(2))
            : Number(priceValue.toFixed(2));

        if (analytics.metrics.visits > 0 && analytics.metrics.orders > 0) {
            analytics.metrics.conversionRate = Number(
                ((analytics.metrics.orders / analytics.metrics.visits) * 100).toFixed(1)
            );
        }

        analytics.recentOrders = analytics.recentOrders || [];
        analytics.recentOrders = [
            {
                id: orderId,
                customer: customerName,
                package: `${platform} - ${packageName}`,
                total: Number(priceValue.toFixed(2)),
                status: 'قيد المراجعة',
                statusCode: 'processing',
                date: now.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }),
                source
            },
            ...analytics.recentOrders
        ].slice(0, 8);

        ensureDailyTrendEntry(analytics, isoDate, label, priceValue);

        persistAnalytics(analytics);
    };

    const attachWhatsAppListeners = () => {
        const buyButtons = document.querySelectorAll('.buy-button');
        if (!buyButtons.length) {
            return;
        }
        buyButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const packageElement = button.closest('.package');
                if (!packageElement) {
                    return;
                }
                const title = packageElement.dataset.title || 'باقة مخصصة';
                const price = packageElement.dataset.price || '0';
                const platform = packageElement.dataset.platform || 'منصة غير محددة';
                recordOrder({ platform, packageName: title, price });

                const message = `أهلاً Boostly،\n\nأود طلب الباقة التالية:\n- المنصة: *${platform}*\n- الباقة: *${title}*\n- السعر: *${price}*\n\nالرجاء تأكيد الطلب.`;
                const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
                window.open(whatsappUrl, '_blank');
            });
        });
    };

    document.addEventListener('DOMContentLoaded', () => {
        seedAnalyticsIfNeeded().finally(() => {
            attachWhatsAppListeners();
        });
    });

    window.boostlyAnalytics = window.boostlyAnalytics || {};
    window.boostlyAnalytics.recordOrder = recordOrder;
    window.boostlyAnalytics.getAnalytics = loadAnalyticsFromStorage;
    window.boostlyAnalytics.persistAnalytics = persistAnalytics;
})();
