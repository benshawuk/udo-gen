<?php

// PUDO mirror of Product.udo.json - the same resource authored as a PHP class.
// Both files produce an identical UDO v1 document; pick whichever format your
// team prefers and feed it to `udo gen`.

use Pudo\Blueprint;
use Pudo\Controller;
use Pudo\Relations;
use Pudo\Resource;

class Product extends Resource
{
    protected ?string $table = 'products';
    protected bool $softDeletes = true;

    public function fields(Blueprint $table): void
    {
        $table->string('title')->required()->max(255);

        $table->string('slug')->required()->format('slug')->max(255)->unique()
            ->rules(backend: ['unique:products,slug']);

        $table->text('description')->format('richText')->nullable();

        $table->decimal('price', precision: 10, scale: 2)
            ->format('currency')->required()->min(0);

        $table->enum('status', ['draft', 'published', 'archived'])
            ->required()->default('draft');

        $table->foreignId('category_id')->required()
            ->references('categories.id')->cascadeOnDelete()
            ->displayField('name');

        $table->unsignedInteger('stock_count')->default(0);

        $table->dateTime('published_at')->nullable()->index();

        $table->index(['status', 'published_at']);
    }

    public function relationships(Relations $relations): void
    {
        $relations->belongsToMany('tags', 'Tag')->pivot('product_tag');
        $relations->hasMany('reviews', 'Review');
    }

    public function controller(): string|Controller
    {
        return Controller::auto()
            ->eagerLoad('category')
            ->defaultSort('-created_at')
            ->pageSize(50);
    }
}
