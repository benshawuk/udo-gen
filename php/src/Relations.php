<?php

namespace Pudo;

/**
 * Collects the relationships NOT implied by a foreignId field.
 * belongsTo is inferred from foreignId + references - never declare it here.
 */
class Relations
{
    /** @var array<string, Relation> */
    private array $relations = [];

    private function add(string $name, string $type, string $model): Relation
    {
        if (isset($this->relations[$name])) {
            throw new \LogicException("Relationship '{$name}' is declared twice.");
        }
        return $this->relations[$name] = new Relation($type, $model);
    }

    public function hasOne(string $name, string $model): Relation
    {
        return $this->add($name, 'hasOne', $model);
    }

    public function hasMany(string $name, string $model): Relation
    {
        return $this->add($name, 'hasMany', $model);
    }

    public function belongsToMany(string $name, string $model): Relation
    {
        return $this->add($name, 'belongsToMany', $model);
    }

    public function morphMany(string $name, string $model, ?string $morphName = null): Relation
    {
        $relation = $this->add($name, 'morphMany', $model);
        if ($morphName !== null) $relation->morphName($morphName);
        return $relation;
    }

    public function morphTo(string $name, string $model, ?string $morphName = null): Relation
    {
        $relation = $this->add($name, 'morphTo', $model);
        if ($morphName !== null) $relation->morphName($morphName);
        return $relation;
    }

    /** @return array<string, array> */
    public function toArray(): array
    {
        return array_map(fn (Relation $r) => $r->toArray(), $this->relations);
    }
}
