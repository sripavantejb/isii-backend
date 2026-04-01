const mongoose = require('mongoose');

const isValidUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (error) {
    return false;
  }
};

const newsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please provide a title'],
      trim: true,
      maxlength: [120, 'Title cannot exceed 120 characters'],
    },
    description: {
      type: String,
      required: [true, 'Please provide a description'],
      trim: true,
      maxlength: [750, 'Description cannot exceed 750 characters'],
    },
    imageUrl: {
      type: String,
      required: [true, 'Please provide an image URL'],
      trim: true,
    },
    articleURL: {
      type: String,
      trim: true,
      validate: {
        validator: (value) => !value || isValidUrl(value),
        message: 'Please provide a valid article URL',
      },
    },
    articleFileUrl: {
      type: String,
      trim: true,
      default: '',
      validate: {
        validator: (value) => !value || isValidUrl(value),
        message: 'Please provide a valid uploaded file URL',
      },
    },
    slug: {
      type: String,
      trim: true,
      default: '',
    },
    publishedAt: {
      type: Date,
      required: [true, 'Please provide a published date and time'],
    },
  },
  {
    timestamps: true,
  }
);

newsSchema.pre('validate', function () {
  const hasArticleUrl = Boolean(this.articleURL && this.articleURL.trim());
  const hasArticleFileUrl = Boolean(this.articleFileUrl && this.articleFileUrl.trim());

  if (!hasArticleUrl && !hasArticleFileUrl) {
    this.invalidate(
      'articleURL',
      'Please provide either an external article URL or an uploaded file'
    );
  }

  if (hasArticleUrl && hasArticleFileUrl) {
    this.invalidate(
      'articleURL',
      'Please choose either an external article URL or an uploaded file, not both'
    );
    this.invalidate(
      'articleFileUrl',
      'Please choose either an external article URL or an uploaded file, not both'
    );
  }

});

module.exports = mongoose.model('News', newsSchema);
