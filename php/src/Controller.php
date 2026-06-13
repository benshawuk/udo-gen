<?php

namespace Pudo;

/**
 * Fluent config for the generated controller. Return one of these from
 * Resource::controller() to unlock the "auto" knobs:
 *
 *   return Controller::auto()
 *       ->eagerLoad('author', 'tags')
 *       ->search('title', 'body')
 *       ->defaultSort('-published_at')
 *       ->pageSize(25);
 */
class Controller
{
    private array $eagerLoad = [];
    private array $scopes = [];
    private array $search = [];
    private ?string $defaultSort = null;
    private ?int $pageSize = null;

    public static function auto(): static
    {
        return new static();
    }

    /** Relations passed to ->with([...]) on index() and show(). */
    public function eagerLoad(string ...$relations): static
    {
        $this->eagerLoad = array_merge($this->eagerLoad, $relations);
        return $this;
    }

    /** Named scopes applied to the index query. */
    public function scopes(string ...$scopes): static
    {
        $this->scopes = array_merge($this->scopes, $scopes);
        return $this;
    }

    /** Columns searched by ?q= on index(). */
    public function search(string ...$columns): static
    {
        $this->search = array_merge($this->search, $columns);
        return $this;
    }

    /** Default sort column; leading '-' means descending. */
    public function defaultSort(string $sort): static
    {
        $this->defaultSort = $sort;
        return $this;
    }

    /** paginate(N) on index(). */
    public function pageSize(int $size): static
    {
        $this->pageSize = $size;
        return $this;
    }

    public function toArray(): array
    {
        $out = ['mode' => 'auto'];
        if ($this->eagerLoad !== []) $out['eagerLoad'] = $this->eagerLoad;
        if ($this->scopes !== []) $out['scopes'] = $this->scopes;
        if ($this->search !== []) $out['search'] = $this->search;
        if ($this->defaultSort !== null) $out['defaultSort'] = $this->defaultSort;
        if ($this->pageSize !== null) $out['pageSize'] = $this->pageSize;
        return $out;
    }
}
