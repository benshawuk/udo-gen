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

    /** 'auto' generates the FormRequest; 'custom' means you write it. */
    protected string $request = 'auto';

    /** 'auto' emits a factory; false skips it. */
    protected string|false $factory = 'auto';

    /** Sidebar hint: ['section' => ..., 'icon' => ..., 'order' => ...]. */
    protected ?array $nav = null;

    /**
     * Computed accessors appended to serialization (Laravel $appends). The
     * accessor bodies live in your model extension; declare the read-only type
     * here so it flows to the API Resource and the frontend Shape.
     *
     * String shorthand for the type, or an array for nullable:
     *
     *   protected array $appends = [
     *       'has_password' => 'boolean',
     *       'display_name' => ['type' => 'string', 'nullable' => true],
     *   ];
     */
    protected array $appends = [];

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
        if ($this->request !== 'auto') $doc['request'] = $this->request;
        if ($this->factory !== 'auto') $doc['factory'] = false;
        if ($this->nav !== null) $doc['nav'] = $this->nav;

        $fields = $blueprint->fieldsToArray();
        if ($fields === []) {
            throw new \LogicException($this->resourceName() . ' declares no fields.');
        }
        $doc['fields'] = $fields;

        $rels = $relations->toArray();
        if ($rels !== []) $doc['relationships'] = $rels;

        if ($this->appends !== []) {
            $appends = [];
            foreach ($this->appends as $name => $spec) {
                if (is_string($spec)) {
                    $appends[$name] = ['type' => $spec];
                } elseif (is_array($spec)) {
                    $appends[$name] = $spec;
                } else {
                    throw new \LogicException(
                        "Append '{$name}' must be a type string or ['type' => ..., 'nullable' => ...] array.",
                    );
                }
            }
            $doc['appends'] = $appends;
        }

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
