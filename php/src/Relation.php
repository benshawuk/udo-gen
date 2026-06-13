<?php

namespace Pudo;

/** Fluent builder for one declared relationship. Created via Relations methods. */
class Relation
{
    private ?string $foreignKey = null;
    private ?string $localKey = null;
    private ?string $pivot = null;
    private ?string $morphName = null;

    public function __construct(
        private string $type,
        private string $model,
    ) {
    }

    /** FK column name override. Defaults to Laravel convention. */
    public function foreignKey(string $column): static
    {
        $this->foreignKey = $column;
        return $this;
    }

    /** Local key override. Defaults to 'id'. */
    public function localKey(string $column): static
    {
        $this->localKey = $column;
        return $this;
    }

    /** For belongsToMany: pivot table name. */
    public function pivot(string $table): static
    {
        $this->pivot = $table;
        return $this;
    }

    /** For morphMany/morphTo: the morph name, e.g. 'commentable'. */
    public function morphName(string $name): static
    {
        $this->morphName = $name;
        return $this;
    }

    public function toArray(): array
    {
        $out = ['type' => $this->type, 'model' => $this->model];
        if ($this->foreignKey !== null) $out['foreignKey'] = $this->foreignKey;
        if ($this->localKey !== null) $out['localKey'] = $this->localKey;
        if ($this->pivot !== null) $out['pivot'] = $this->pivot;
        if ($this->morphName !== null) $out['morphName'] = $this->morphName;
        return $out;
    }
}
