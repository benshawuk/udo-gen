import { describe, expect, it } from 'vitest';
import type { UdoDocument } from '../../src/types.js';
import { buildModelBaseContext, buildRelationMethods, renderModelBase } from '../../src/generate/model-base.js';

// Comprehensive coverage for the bug found during tinker walkthrough:
// model-base must emit belongsTo (from foreignId) and all declared relationship
// methods, with the correct return type imports.

describe('buildRelationMethods', () => {
  it('returns empty when no FK columns and no relationships block', () => {
    const methods = buildRelationMethods({
      udoVersion: 1,
      resource: 'Tag',
      fields: { name: { type: 'string', required: true } },
    });
    expect(methods).toEqual([]);
  });

  it('emits a belongsTo method for each foreignId field', () => {
    const methods = buildRelationMethods({
      udoVersion: 1,
      resource: 'Post',
      fields: {
        title: { type: 'string', required: true },
        author_id: { type: 'foreignId', references: 'users.id' },
        category_id: { type: 'foreignId', references: 'categories.id' },
      },
    });
    expect(methods).toHaveLength(2);
    expect(methods[0]).toMatchObject({
      name: 'author',
      returnType: 'BelongsTo',
      body: 'return $this->belongsTo(\\App\\Models\\User::class);',
    });
    expect(methods[1]).toMatchObject({
      name: 'category',
      returnType: 'BelongsTo',
      body: 'return $this->belongsTo(\\App\\Models\\Category::class);',
    });
  });

  it('strips _id suffix from the relation name', () => {
    const methods = buildRelationMethods({
      udoVersion: 1,
      resource: 'Product',
      fields: { customer_id: { type: 'foreignId', references: 'customers.id' } },
    });
    expect(methods[0]?.name).toBe('customer');
  });

  it('singularizes the references table for the model class', () => {
    const methods = buildRelationMethods({
      udoVersion: 1,
      resource: 'Product',
      fields: { category_id: { type: 'foreignId', references: 'categories.id' } },
    });
    expect(methods[0]?.body).toContain('\\App\\Models\\Category::class');
  });

  it('emits a hasOne method from the relationships block', () => {
    const methods = buildRelationMethods({
      udoVersion: 1,
      resource: 'User',
      fields: { name: { type: 'string' } },
      relationships: { profile: { type: 'hasOne', model: 'Profile' } },
    });
    expect(methods).toHaveLength(1);
    expect(methods[0]).toMatchObject({
      name: 'profile',
      returnType: 'HasOne',
      body: 'return $this->hasOne(\\App\\Models\\Profile::class);',
    });
  });

  it('emits hasOne with custom foreignKey when provided', () => {
    const methods = buildRelationMethods({
      udoVersion: 1,
      resource: 'User',
      fields: { name: { type: 'string' } },
      relationships: {
        profile: { type: 'hasOne', model: 'Profile', foreignKey: 'user_uuid' },
      },
    });
    expect(methods[0]?.body).toContain("'user_uuid'");
  });

  it('emits a hasMany method from the relationships block', () => {
    const methods = buildRelationMethods({
      udoVersion: 1,
      resource: 'Author',
      fields: { name: { type: 'string' } },
      relationships: { posts: { type: 'hasMany', model: 'Post' } },
    });
    expect(methods[0]).toMatchObject({
      name: 'posts',
      returnType: 'HasMany',
      body: 'return $this->hasMany(\\App\\Models\\Post::class);',
    });
  });

  it('emits hasMany with custom foreignKey', () => {
    const methods = buildRelationMethods({
      udoVersion: 1,
      resource: 'Author',
      fields: { name: { type: 'string' } },
      relationships: {
        posts: { type: 'hasMany', model: 'Post', foreignKey: 'creator_id' },
      },
    });
    expect(methods[0]?.body).toContain("'creator_id'");
  });

  it('emits belongsToMany without pivot when not specified', () => {
    const methods = buildRelationMethods({
      udoVersion: 1,
      resource: 'Post',
      fields: { title: { type: 'string' } },
      relationships: { tags: { type: 'belongsToMany', model: 'Tag' } },
    });
    expect(methods[0]).toMatchObject({
      name: 'tags',
      returnType: 'BelongsToMany',
      body: 'return $this->belongsToMany(\\App\\Models\\Tag::class);',
    });
  });

  it('emits belongsToMany with pivot table name', () => {
    const methods = buildRelationMethods({
      udoVersion: 1,
      resource: 'Post',
      fields: { title: { type: 'string' } },
      relationships: { tags: { type: 'belongsToMany', model: 'Tag', pivot: 'post_tag' } },
    });
    expect(methods[0]?.body).toContain("'post_tag'");
  });

  it('emits morphTo without model argument', () => {
    const methods = buildRelationMethods({
      udoVersion: 1,
      resource: 'Comment',
      fields: { body: { type: 'text' } },
      relationships: { commentable: { type: 'morphTo', model: 'Commentable' } },
    });
    expect(methods[0]).toMatchObject({
      name: 'commentable',
      returnType: 'MorphTo',
      body: 'return $this->morphTo();',
    });
  });

  it('emits morphMany with morphName', () => {
    const methods = buildRelationMethods({
      udoVersion: 1,
      resource: 'Post',
      fields: { title: { type: 'string' } },
      relationships: {
        comments: { type: 'morphMany', model: 'Comment', morphName: 'commentable' },
      },
    });
    expect(methods[0]).toMatchObject({
      name: 'comments',
      returnType: 'MorphMany',
    });
    expect(methods[0]?.body).toContain("'commentable'");
  });

  it('falls back to method name for morphMany when morphName omitted', () => {
    const methods = buildRelationMethods({
      udoVersion: 1,
      resource: 'Image',
      fields: { url: { type: 'string' } },
      relationships: { imageable: { type: 'morphMany', model: 'Imageable' } },
    });
    expect(methods[0]?.body).toContain("'imageable'");
  });

  it('combines FK-implied belongsTo with declared block relationships', () => {
    const methods = buildRelationMethods({
      udoVersion: 1,
      resource: 'Post',
      fields: {
        title: { type: 'string' },
        author_id: { type: 'foreignId', references: 'users.id' },
      },
      relationships: {
        tags: { type: 'belongsToMany', model: 'Tag', pivot: 'post_tag' },
        reviews: { type: 'hasMany', model: 'Review' },
      },
    });
    expect(methods.map((m) => m.name)).toEqual(['author', 'tags', 'reviews']);
    expect(methods.map((m) => m.returnType)).toEqual(['BelongsTo', 'BelongsToMany', 'HasMany']);
  });

  it('skips non-foreignId fields when inferring belongsTo', () => {
    const methods = buildRelationMethods({
      udoVersion: 1,
      resource: 'Product',
      fields: {
        title: { type: 'string' },
        user_id: { type: 'integer' },
      },
    });
    expect(methods).toHaveLength(0);
  });
});

describe('buildModelBaseContext relations + imports', () => {
  it('collects unique relationship imports', () => {
    const ctx = buildModelBaseContext({
      udoVersion: 1,
      resource: 'Post',
      fields: {
        author_id: { type: 'foreignId', references: 'users.id' },
        editor_id: { type: 'foreignId', references: 'users.id' },
      },
      relationships: {
        tags: { type: 'belongsToMany', model: 'Tag' },
        reviews: { type: 'hasMany', model: 'Review' },
        more_reviews: { type: 'hasMany', model: 'Review' },
      },
    });
    // Should be sorted, de-duped: [BelongsTo, BelongsToMany, HasMany]
    expect(ctx.uniqueRelationImports).toEqual(['BelongsTo', 'BelongsToMany', 'HasMany']);
  });
});

describe('renderModelBase with relationships', () => {
  it('emits all relationship methods + their imports', async () => {
    const output = await renderModelBase({
      udoVersion: 1,
      resource: 'Post',
      fields: {
        title: { type: 'string', required: true },
        author_id: { type: 'foreignId', references: 'users.id' },
      },
      relationships: {
        tags: { type: 'belongsToMany', model: 'Tag', pivot: 'post_tag' },
        reviews: { type: 'hasMany', model: 'Review' },
      },
    });
    expect(output).toContain('use Illuminate\\Database\\Eloquent\\Relations\\BelongsTo;');
    expect(output).toContain('use Illuminate\\Database\\Eloquent\\Relations\\BelongsToMany;');
    expect(output).toContain('use Illuminate\\Database\\Eloquent\\Relations\\HasMany;');
    expect(output).toContain('public function author(): BelongsTo');
    expect(output).toContain('public function tags(): BelongsToMany');
    expect(output).toContain('public function reviews(): HasMany');
    expect(output).toContain('return $this->belongsTo(\\App\\Models\\User::class);');
    expect(output).toContain("return $this->belongsToMany(\\App\\Models\\Tag::class, 'post_tag');");
    expect(output).toContain('return $this->hasMany(\\App\\Models\\Review::class);');
  });

  it('does not emit relation imports when there are no relations', async () => {
    const output = await renderModelBase({
      udoVersion: 1,
      resource: 'Tag',
      fields: { name: { type: 'string', required: true } },
    });
    expect(output).not.toContain('Illuminate\\Database\\Eloquent\\Relations\\');
  });
});
