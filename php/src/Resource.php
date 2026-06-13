<?php

namespace Pudo;

/**
 * Base class for a PUDO definition - the PHP authoring format for a UDO.
 *
 * A PUDO file declares the same facts as a .udo.json file, but as a Laravel
 * style class. It serializes to the identical UDO v1 document, so every
 * adapter downstream is shared between the two formats.
 *
 *   class Product extends Resource
 *   {
 *       protected bool $softDeletes = true;
 *
 *       public function fields(Blueprint $table): void
 *       {
 *           $table->string('title')->required()->max(255);
 *           $table->decimal('price', 10, 2)->required()->min(0);
 *       }
 *   }
 *
 * Facts only, never logic: if a definition needs an if, a loop, or a function
 * call, it belongs in the generated PHP/TS extension files instead.
 */
abstract class Resource
{
    /** PascalCase resource name. Defaults to the class short name. */
    protected ?string $resource = null;

    /** DB table name. Defaults to snake_case plural of the resource. */
    protected ?string $table = null;

    /** created_at / updated_at columns. */
    protected bool $timestamps = true;

    /** deleted_at column + SoftDeletes trait. */
    protected bool $softDeletes = false;

    /** 'auto' generates the API Resource; 'custom' means you write it. */
    protected string $transformer = 'auto';

    /** 'auto' emits a factory; false skips it. */
    protected string|false $factory = 'auto';

    /** Sidebar hint: ['section' => ..., 'icon' => ..., 'order' => ...]. */
    protected ?array $nav = null;

    /** Declare every column, plus composite indexes. */
    abstract public function fields(Blueprint $table): void;

    /** Relationships not implied by a foreignId field. belongsTo is inferred. */
    public function relationships(Relations $relations): void
    {
    }

    /** Optional form/table/card overrides. */
    public function views(Views $views): void
    {
    }

    /** 'auto' (stock CRUD), 'custom' (you write it), or Controller::auto()->... */
    public function controller(): string|Controller
    {
        return 'auto';
    }

    /** Assemble the canonical UDO v1 document. */
    final public function toDocument(): array
    {
        $blueprint = new Blueprint();
        $this->fields($blueprint);

        $relations = new Relations();
        $this->relationships($relations);

        $views = new Views();
        $this->views($views);

        $doc = [
            'udoVersion' => 1,
            'resource' => $this->resourceName(),
        ];

        if ($this->table !== null) $doc['table'] = $this->table;
        if (!$this->timestamps) $doc['timestamps'] = false;
        if ($this->softDeletes) $doc['softDeletes'] = true;

        $controller = $this->controller();
        if ($controller instanceof Controller) {
            $doc['controller'] = $controller->toArray();
        } elseif ($controller !== 'auto') {
            $doc['controller'] = $controller;
        }

        if ($this->transformer !== 'auto') $doc['transformer'] = $this->transformer;
        if ($this->factory !== 'auto') $doc['factory'] = false;
        if ($this->nav !== null) $doc['nav'] = $this->nav;

        $fields = $blueprint->fieldsToArray();
        if ($fields === []) {
            throw new \LogicException($this->resourceName() . ' declares no fields.');
        }
        $doc['fields'] = $fields;

        $rels = $relations->toArray();
        if ($rels !== []) $doc['relationships'] = $rels;

        $indexes = $blueprint->indexesToArray();
        if ($indexes !== []) $doc['indexes'] = $indexes;

        $viewArr = $views->toArray();
        if ($viewArr !== []) $doc['views'] = $viewArr;

        return $doc;
    }

    final public function toJson(): string
    {
        return json_encode(
            $this->toDocument(),
            JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
        );
    }

    private function resourceName(): string
    {
        if ($this->resource !== null) {
            return $this->resource;
        }
        $class = static::class;
        $pos = strrpos($class, '\\');
        return $pos === false ? $class : substr($class, $pos + 1);
    }
}
