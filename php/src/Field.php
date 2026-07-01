<?php

namespace Pudo;

/**
 * Fluent builder for a single UDO field. Created via Blueprint type methods
 * (e.g. $table->string('title')); every setter returns $this so declarations
 * read like Laravel migration columns.
 */
class Field
{
    private const NO_DEFAULT = "\0pudo-no-default\0";

    private string $type;
    private ?string $format = null;
    private bool $required = false;
    private bool $nullable = false;
    private bool $unique = false;
    private bool $index = false;
    private mixed $default = self::NO_DEFAULT;
    private int|float|null $max = null;
    private int|float|null $min = null;
    private ?int $length = null;
    private ?int $precision = null;
    private ?int $scale = null;
    private ?array $values = null;
    private ?string $references = null;
    private ?string $onDelete = null;
    private ?string $displayField = null;
    private ?string $label = null;
    private array $backendRules = [];
    private array $frontendRules = [];
    private array $skipBackend = [];
    private array $skipFrontend = [];
    private ?string $widget = null;
    private ?string $help = null;
    private ?string $placeholder = null;
    private ?string $displayFormat = null;
    private bool $hidden = false;
    private ?string $cast = null;

    public function __construct(string $type)
    {
        $this->type = $type;
    }

    /** Semantic flavour, e.g. 'email', 'slug', 'markdown'. Drives widget + validation defaults. */
    public function format(string $format): static
    {
        $this->format = $format;
        return $this;
    }

    public function required(bool $required = true): static
    {
        $this->required = $required;
        return $this;
    }

    public function nullable(bool $nullable = true): static
    {
        $this->nullable = $nullable;
        return $this;
    }

    /** DB unique constraint + unique index on this column. */
    public function unique(bool $unique = true): static
    {
        $this->unique = $unique;
        return $this;
    }

    /** Single-column non-unique index. Composite indexes live on the Blueprint. */
    public function index(bool $index = true): static
    {
        $this->index = $index;
        return $this;
    }

    public function default(string|int|float|bool|null $value): static
    {
        $this->default = $value;
        return $this;
    }

    /** For strings: max length. For numbers: max value. */
    public function max(int|float $max): static
    {
        $this->max = $max;
        return $this;
    }

    /** For strings: min length. For numbers: min value. */
    public function min(int|float $min): static
    {
        $this->min = $min;
        return $this;
    }

    /** Exact length, e.g. char(N) or string(N). */
    public function length(int $length): static
    {
        $this->length = $length;
        return $this;
    }

    public function precision(int $precision): static
    {
        $this->precision = $precision;
        return $this;
    }

    public function scale(int $scale): static
    {
        $this->scale = $scale;
        return $this;
    }

    /** Enum: the allowed values. */
    public function values(array $values): static
    {
        $this->values = array_values($values);
        return $this;
    }

    /** For foreignId: 'table.column' the FK points at. Implies belongsTo. */
    public function references(string $tableDotColumn): static
    {
        $this->references = $tableDotColumn;
        return $this;
    }

    /** FK onDelete behavior: 'cascade' | 'restrict' | 'set null' | 'no action'. */
    public function onDelete(string $behavior): static
    {
        $this->onDelete = $behavior;
        return $this;
    }

    public function cascadeOnDelete(): static
    {
        return $this->onDelete('cascade');
    }

    public function restrictOnDelete(): static
    {
        return $this->onDelete('restrict');
    }

    public function nullOnDelete(): static
    {
        return $this->onDelete('set null');
    }

    public function noActionOnDelete(): static
    {
        return $this->onDelete('no action');
    }

    /** For foreignId: the related row's field shown in pickers, e.g. 'name'. */
    public function displayField(string $field): static
    {
        $this->displayField = $field;
        return $this;
    }

    /** Translation key override. Convention is '{resource}.fields.{field_name}'. */
    public function label(string $translationKey): static
    {
        $this->label = $translationKey;
        return $this;
    }

    /**
     * Extra validation rules appended on one or both sides.
     * e.g. ->rules(backend: ['unique:products,slug']).
     */
    public function rules(array $backend = [], array $frontend = []): static
    {
        $this->backendRules = array_merge($this->backendRules, array_values($backend));
        $this->frontendRules = array_merge($this->frontendRules, array_values($frontend));
        return $this;
    }

    /**
     * Remove a shared semantic rule on one side only.
     * e.g. ->skipRules(frontend: ['max']).
     */
    public function skipRules(array $backend = [], array $frontend = []): static
    {
        $this->skipBackend = array_merge($this->skipBackend, array_values($backend));
        $this->skipFrontend = array_merge($this->skipFrontend, array_values($frontend));
        return $this;
    }

    /** Override the default widget, e.g. 'textarea', 'markdown-editor'. */
    public function widget(string $widget): static
    {
        $this->widget = $widget;
        return $this;
    }

    /** Translation key for help text. */
    public function help(string $translationKey): static
    {
        $this->help = $translationKey;
        return $this;
    }

    /** Translation key for placeholder text. */
    public function placeholder(string $translationKey): static
    {
        $this->placeholder = $translationKey;
        return $this;
    }

    /** Display format hint, e.g. 'currency:USD'. Maps to ui.format. */
    public function displayFormat(string $format): static
    {
        $this->displayFormat = $format;
        return $this;
    }

    /**
     * Exclude from API serialization (Laravel $hidden) and the read Shape.
     * Still writable on create/update - use for secrets and password hashes.
     */
    public function hidden(bool $hidden = true): static
    {
        $this->hidden = $hidden;
        return $this;
    }

    /**
     * Override the inferred Eloquent cast, e.g. 'hashed', 'encrypted',
     * 'encrypted:array'. Takes precedence over the type-derived cast.
     */
    public function cast(string $cast): static
    {
        $this->cast = $cast;
        return $this;
    }

    public function toArray(): array
    {
        $out = ['type' => $this->type];

        if ($this->format !== null) $out['format'] = $this->format;
        if ($this->required) $out['required'] = true;
        if ($this->nullable) $out['nullable'] = true;
        if ($this->unique) $out['unique'] = true;
        if ($this->index) $out['index'] = true;
        if ($this->default !== self::NO_DEFAULT) $out['default'] = $this->default;
        if ($this->max !== null) $out['max'] = $this->max;
        if ($this->min !== null) $out['min'] = $this->min;
        if ($this->length !== null) $out['length'] = $this->length;
        if ($this->precision !== null) $out['precision'] = $this->precision;
        if ($this->scale !== null) $out['scale'] = $this->scale;
        if ($this->values !== null) $out['values'] = $this->values;
        if ($this->references !== null) $out['references'] = $this->references;
        if ($this->onDelete !== null) $out['onDelete'] = $this->onDelete;
        if ($this->displayField !== null) $out['displayField'] = $this->displayField;
        if ($this->label !== null) $out['label'] = $this->label;
        if ($this->hidden) $out['hidden'] = true;
        if ($this->cast !== null) $out['cast'] = $this->cast;

        $validation = [];
        if ($this->backendRules !== []) $validation['backend'] = $this->backendRules;
        if ($this->frontendRules !== []) $validation['frontend'] = $this->frontendRules;
        $skip = [];
        if ($this->skipBackend !== []) $skip['backend'] = $this->skipBackend;
        if ($this->skipFrontend !== []) $skip['frontend'] = $this->skipFrontend;
        if ($skip !== []) $validation['skip'] = $skip;
        if ($validation !== []) $out['validation'] = $validation;

        $ui = [];
        if ($this->widget !== null) $ui['widget'] = $this->widget;
        if ($this->help !== null) $ui['help'] = $this->help;
        if ($this->placeholder !== null) $ui['placeholder'] = $this->placeholder;
        if ($this->displayFormat !== null) $ui['format'] = $this->displayFormat;
        if ($ui !== []) $out['ui'] = $ui;

        return $out;
    }
}
