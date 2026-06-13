<?php

namespace Pudo;

/**
 * Collects field declarations and composite indexes for a resource.
 * One type method per UDO primitive, so definitions read like a Laravel
 * migration: $table->string('title')->required()->max(255).
 */
class Blueprint
{
    /** @var array<string, Field> */
    private array $fields = [];

    /** @var list<array{columns: list<string>, unique?: bool, name?: string}> */
    private array $indexes = [];

    private function add(string $name, string $type): Field
    {
        if (isset($this->fields[$name])) {
            throw new \LogicException("Field '{$name}' is declared twice.");
        }
        return $this->fields[$name] = new Field($type);
    }

    public function string(string $name, ?int $length = null): Field
    {
        $field = $this->add($name, 'string');
        if ($length !== null) $field->length($length);
        return $field;
    }

    public function text(string $name): Field
    {
        return $this->add($name, 'text');
    }

    public function longText(string $name): Field
    {
        return $this->add($name, 'longText');
    }

    public function mediumText(string $name): Field
    {
        return $this->add($name, 'mediumText');
    }

    public function integer(string $name): Field
    {
        return $this->add($name, 'integer');
    }

    public function bigInteger(string $name): Field
    {
        return $this->add($name, 'bigInteger');
    }

    public function tinyInteger(string $name): Field
    {
        return $this->add($name, 'tinyInteger');
    }

    public function unsignedInteger(string $name): Field
    {
        return $this->add($name, 'unsignedInteger');
    }

    public function unsignedTinyInteger(string $name): Field
    {
        return $this->add($name, 'unsignedTinyInteger');
    }

    public function decimal(string $name, ?int $precision = null, ?int $scale = null): Field
    {
        $field = $this->add($name, 'decimal');
        if ($precision !== null) $field->precision($precision);
        if ($scale !== null) $field->scale($scale);
        return $field;
    }

    public function float(string $name): Field
    {
        return $this->add($name, 'float');
    }

    public function double(string $name): Field
    {
        return $this->add($name, 'double');
    }

    public function boolean(string $name): Field
    {
        return $this->add($name, 'boolean');
    }

    public function date(string $name): Field
    {
        return $this->add($name, 'date');
    }

    public function dateTime(string $name): Field
    {
        return $this->add($name, 'dateTime');
    }

    public function timestamp(string $name): Field
    {
        return $this->add($name, 'timestamp');
    }

    public function time(string $name): Field
    {
        return $this->add($name, 'time');
    }

    public function json(string $name): Field
    {
        return $this->add($name, 'json');
    }

    public function uuid(string $name): Field
    {
        return $this->add($name, 'uuid');
    }

    public function foreignId(string $name): Field
    {
        return $this->add($name, 'foreignId');
    }

    public function binary(string $name): Field
    {
        return $this->add($name, 'binary');
    }

    /** Enum convenience: a string field constrained to the given values. */
    public function enum(string $name, array $values): Field
    {
        return $this->add($name, 'string')->values($values);
    }

    /**
     * Composite non-unique index. Single-column indexes belong on the
     * field itself via ->index() or ->unique().
     */
    public function index(array $columns, ?string $name = null): void
    {
        $this->addIndex($columns, false, $name);
    }

    /** Composite unique index. */
    public function unique(array $columns, ?string $name = null): void
    {
        $this->addIndex($columns, true, $name);
    }

    private function addIndex(array $columns, bool $unique, ?string $name): void
    {
        if (count($columns) < 2) {
            throw new \LogicException(
                'Composite indexes need at least 2 columns; use ->index() or ->unique() on the field for single columns.',
            );
        }
        $entry = ['columns' => array_values($columns)];
        if ($unique) $entry['unique'] = true;
        if ($name !== null) $entry['name'] = $name;
        $this->indexes[] = $entry;
    }

    /** @return array<string, array> */
    public function fieldsToArray(): array
    {
        return array_map(fn (Field $f) => $f->toArray(), $this->fields);
    }

    /** @return list<array> */
    public function indexesToArray(): array
    {
        return $this->indexes;
    }
}
