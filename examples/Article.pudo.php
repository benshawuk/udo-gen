<?php

// Stress example for the PUDO format: exercises every part of the v1 syntax,
// mirroring the annotated Article JSONC example in the README. Most real
// PUDOs are a fraction of this size - this one is a tour.

use Pudo\Blueprint;
use Pudo\Controller;
use Pudo\Relations;
use Pudo\Resource;
use Pudo\Views;

class Article extends Resource
{
    protected ?string $table = 'articles';
    protected bool $softDeletes = true;

    // Sidebar/navigation hint consumed by the React scaffold.
    protected ?array $nav = ['section' => 'Content', 'icon' => 'newspaper', 'order' => 20];

    public function fields(Blueprint $table): void
    {
        $table->string('title')->required()->max(255);

        $table->string('slug')->required()->format('slug')->max(255)->unique()
            ->rules(backend: ['unique:articles,slug']); // DB-aware rule: backend only

        $table->longText('body')->format('markdown')->nullable()
            // ui strings are TRANSLATION KEYS, never English
            ->widget('markdown-editor')
            ->help('articles.fields.body.help')
            ->placeholder('articles.fields.body.placeholder')
            ->skipRules(frontend: ['max']); // drop a shared facet on one side only

        $table->text('excerpt')->nullable()->max(500)
            ->label('articles.fields.summary'); // override the convention-derived key

        $table->enum('status', ['draft', 'review', 'published', 'archived'])
            ->required()->default('draft');

        $table->unsignedTinyInteger('reading_minutes')->default(1)->min(1)->max(240);

        $table->decimal('rating', precision: 5, scale: 2)->format('percent')->nullable();

        $table->boolean('is_featured')->default(false)->index();

        $table->json('metadata')->nullable();

        $table->uuid('external_id')->format('uuid')->nullable()->unique();

        $table->foreignId('author_id')->required()
            ->references('users.id') // implies belongsTo(User) + exists: rule
            ->cascadeOnDelete()
            ->displayField('name');  // related field shown in pickers

        $table->dateTime('published_at')->nullable()->index();

        // Composite indexes (single-column indexes use the field-level flags).
        $table->index(['status', 'published_at']);
        $table->unique(['author_id', 'created_at'], name: 'articles_author_recent');
    }

    // Only the relationships NOT implied by a foreignId.
    // belongsTo(User) is already inferred from author_id, so it is not repeated.
    public function relationships(Relations $relations): void
    {
        $relations->hasOne('featuredImage', 'Image')->foreignKey('article_id');
        $relations->hasMany('revisions', 'Revision');
        $relations->belongsToMany('tags', 'Tag')->pivot('article_tag');
        $relations->morphMany('comments', 'Comment', morphName: 'commentable');
        $relations->morphTo('owner', 'Article', morphName: 'ownable');
    }

    public function controller(): string|Controller
    {
        return Controller::auto()
            ->eagerLoad('author', 'tags')
            ->scopes('published')
            ->search('title', 'body')
            ->defaultSort('-published_at')
            ->pageSize(25);
    }

    // Views: only when overriding the default "all fields, declared order".
    public function views(Views $views): void
    {
        $views->form(
            fields: ['title', 'slug', 'status', 'body', 'excerpt', 'published_at'],
            layout: 'two-column',
        );

        $views->table(
            columns: [
                ['field' => 'title', 'sortable' => true],
                'author.name', // dotted path = relation
                ['field' => 'status', 'badge' => true],
                ['field' => 'rating', 'align' => 'right', 'format' => 'percent'],
            ],
            search: ['title', 'body'],
            defaultSort: '-published_at',
            pageSize: 25,
        );

        $views->card(
            title: 'title',
            subtitle: 'author.name',
            body: ['excerpt', 'status'],
        );
    }
}
