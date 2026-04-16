import express from 'express';
import { Product } from '../models/Product.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const {
            cart = [],
            viewed = [],
            timeContext = "auto",
            mood = "neutral",
            behavior = {},
            location = null,
            consent = false,
            event = "none"   // ✅ NEW
        } = req.body;

        // =========================
        // ❌ NO CONSENT → GENERIC PRODUCTS
        // =========================
        if (!consent) {
            return res.json([]);
        }

        // =========================
        // ⏱ TIME CONTEXT
        // =========================
        let hour;
        if (timeContext === "auto") hour = new Date().getHours();
        else if (timeContext === "morning") hour = 8;
        else if (timeContext === "afternoon") hour = 14;
        else hour = 20;

        let timeKeywords = [];
        let timeLabel = "";

        if (hour >= 6 && hour < 12) {
            timeKeywords = ["sports"];
            timeLabel = "Morning trend";
        } else if (hour < 18) {
            timeKeywords = ["shoes", "footwear"];
            timeLabel = "Afternoon trend";
        } else {
            timeKeywords = ["apparel", "fashion"];
            timeLabel = "Evening trend";
        }

        // =========================
        // 🎉 EVENT CONTEXT
        // =========================
        let eventKeywords = [];
        let eventLabel = "";

        if (event === "valentine") {
            eventKeywords = ["perfume", "gift", "flowers", "chocolate"];
            eventLabel = "Valentine Special 💖";
        }
        else if (event === "diwali") {
            eventKeywords = ["ethnic", "kurta", "saree", "decor"];
            eventLabel = "Diwali Festive Picks 🪔";
        }
        else if (event === "newyear") {
            eventKeywords = ["party", "dress", "watch", "shoes"];
            eventLabel = "New Year Party 🎉";
        }

        // =========================
        // 🧠 USER KEYWORDS
        // =========================
        const cartKeywords = cart.flatMap(item => item.product?.keywords || []);
        const viewedKeywords = viewed.flatMap(p => p.keywords || []);

        const baseKeywords = viewedKeywords.length > 0 ? viewedKeywords : cartKeywords;

        const finalKeywords = [
            ...baseKeywords,
            ...timeKeywords,
            ...eventKeywords   // ✅ INCLUDE EVENT
        ].map(k => k.toLowerCase());

        const products = await Product.findAll();

        // =========================
        // ⏳ RECENCY FUNCTION
        // =========================
        const getRecencyBoost = () => {
            if (!behavior.lastActivity) return 0;

            const secondsAgo = (Date.now() - behavior.lastActivity) / 1000;

            if (secondsAgo < 10) return 3;
            if (secondsAgo < 30) return 2;
            if (secondsAgo < 60) return 1;

            return 0;
        };

        const recencyBoost = getRecencyBoost();

        const recommended = products
            .map(product => {
                const p = product.toJSON();

                const productKeywords = (p.keywords || []).map(k => k.toLowerCase());

                const matchedKeywords = productKeywords.filter(k =>
                    finalKeywords.includes(k)
                );

                let score = 0;
                let reasons = [];

                if (matchedKeywords.length > 0) {
                    score += matchedKeywords.length * 2;
                }

                if (cart.some(c => c.product?.id === p.id)) {
                    score += 5;
                    reasons.push({
                        type: "cart",
                        text: "From your cart activity",
                        weight: 5
                    });
                }

                if (viewed.some(v => v.id === p.id)) {
                    score += 3;
                    reasons.push({
                        type: "viewed",
                        text: "Recently viewed",
                        weight: 4
                    });
                }

                if (behavior.clicks > 0 && matchedKeywords.length > 0) {
                    score += 2 + recencyBoost;
                    reasons.push({
                        type: "click",
                        text: "Based on your recent clicks",
                        weight: 4
                    });
                }

                if (behavior.hovers > 0 && matchedKeywords.length > 0) {
                    score += 1 + recencyBoost;
                    reasons.push({
                        type: "hover",
                        text: "You explored similar items",
                        weight: 3
                    });
                }

                if (behavior.categories) {
                    const sorted = Object.entries(behavior.categories)
                        .sort((a, b) => b[1] - a[1]);

                    const topCategory = sorted[0]?.[0];

                    if (
                        topCategory &&
                        productKeywords.includes(topCategory.toLowerCase())
                    ) {
                        score += 3;
                        reasons.push({
                            type: "category",
                            text: "Matches your favorite category",
                            weight: 3
                        });
                    }
                }

                // ⏱ TIME MATCH
                const isTimeMatch = timeKeywords.some(k =>
                    productKeywords.includes(k)
                );

                if (isTimeMatch) {
                    score += 2;
                    reasons.push({
                        type: "time",
                        text: timeLabel,
                        weight: 2
                    });
                }

                // 🎉 EVENT MATCH
                const isEventMatch = eventKeywords.some(k =>
                    productKeywords.includes(k)
                );

                if (isEventMatch) {
                    score += 3;
                    reasons.push({
                        type: "event",
                        text: eventLabel,
                        weight: 5
                    });
                }

                if (location) {
                    score += 1.5;
                    reasons.push({
                        type: "location",
                        text: `Trending in ${location}`,
                        weight: 2
                    });
                }

                if (score < 2) return null;

                reasons.sort((a, b) => b.weight - a.weight);

                const primary = reasons[0]?.text;
                const timeR = reasons.find(r => r.type === "time")?.text;
                const locR = reasons.find(r => r.type === "location")?.text;
                const eventR = reasons.find(r => r.type === "event")?.text;

                let finalReason = primary;

                if (eventR && timeR && locR) {
                    finalReason = `${primary} • ${eventR} • ${timeR} • ${locR}`;
                }
                else if (eventR && timeR) {
                    finalReason = `${primary} • ${eventR} • ${timeR}`;
                }
                else if (eventR) {
                    finalReason = `${primary} • ${eventR}`;
                }
                else if (timeR && locR) {
                    finalReason = `${primary} • ${timeR} • ${locR}`;
                }
                else if (timeR) {
                    finalReason = `${primary} • ${timeR}`;
                }
                else if (locR) {
                    finalReason = `${primary} • ${locR}`;
                }

                return {
                    ...p,
                    score,
                    reason: finalReason,
                    reasons
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score)
            .slice(0, 12);

        // =========================
        // 🎯 DIVERSIFICATION
        // =========================
        const diversified = [];
        const seenCategories = new Set();

        for (let item of recommended) {
            const cat = item.category || "general";

            if (!seenCategories.has(cat) || diversified.length < 5) {
                diversified.push(item);
                seenCategories.add(cat);
            }

            if (diversified.length >= 8) break;
        }

        res.json(diversified);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Personalization failed' });
    }
});

export default router;