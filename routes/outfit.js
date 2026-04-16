import express from 'express';
import multer from 'multer';
import { Product } from '../models/Product.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/', upload.single('image'), async (req, res) => {
  try {

    console.log("Uploaded file:", req.file);
    console.log("File name:", req.file?.originalname);

    const gender = (req.body.gender || "male").toLowerCase();

    // ✅ Detect outfit type from filename
    const fileName = (req.file?.originalname || "").toLowerCase();

    let outfitType = "casual";
    if (fileName.includes("jacket")) {
      outfitType = "jacket";
    }

    const products = await Product.findAll();

    console.log("Gender from frontend:", gender);
    console.log("Outfit type:", outfitType);
    console.log("Total products:", products.length);

    // ✅ FLEXIBLE MATCHING (handles mens/men/male issues)
    const matched = products.filter(p => {
      const g = p.gender?.toLowerCase() || "";
      const o = p.outfitTag?.toLowerCase() || "";

      return (
        g.includes(gender) &&
        o.includes(outfitType)
      );
    });

    console.log("Matched products:", matched);

    // ✅ FALLBACK (VERY IMPORTANT — never show empty UI)
    if (matched.length === 0) {
      console.log("⚠️ No exact match → showing fallback products");

      const fallback = products.filter(p =>
        p.keywords?.some(k =>
          ["apparel", "shoes", "footwear"].includes(k.toLowerCase())
        )
      ).slice(0, 6);

      return res.json(fallback);
    }

    res.json(matched);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Outfit processing failed" });
  }
});

export default router;