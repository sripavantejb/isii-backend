const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Article = require('../models/Article');

dotenv.config();

const updateArticles = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI ;
    await mongoose.connect(mongoUri);
    console.log('MongoDB Connected');

    // Update November 2022 article title
    const novemberArticle = await Article.findOne({ date: /november\s+2022/i });
    if (novemberArticle) {
      novemberArticle.title = "Xi Achieves Absolute Power, For What Greater Purpose?";
      await novemberArticle.save();
      console.log(`✅ Updated November 2022 article: ${novemberArticle._id}`);
      console.log(`   New title: ${novemberArticle.title}`);
    } else {
      console.log('⚠️  November 2022 article not found');
    }

    // Delete February 2021 article
    const feb2021Article = await Article.findOne({ date: /february\s+2021/i });
    if (feb2021Article) {
      await Article.deleteOne({ _id: feb2021Article._id });
      console.log(`✅ Deleted February 2021 article: ${feb2021Article._id}`);
      console.log(`   Title: ${feb2021Article.title}`);
    } else {
      console.log('⚠️  February 2021 article not found');
    }

    // Delete December 2019 article
    const dec2019Article = await Article.findOne({ date: /december\s+2019/i });
    if (dec2019Article) {
      await Article.deleteOne({ _id: dec2019Article._id });
      console.log(`✅ Deleted December 2019 article: ${dec2019Article._id}`);
      console.log(`   Title: ${dec2019Article.title}`);
    } else {
      console.log('⚠️  December 2019 article not found');
    }

    console.log('\n✅ Article updates completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating articles:', error);
    process.exit(1);
  }
};

updateArticles();

