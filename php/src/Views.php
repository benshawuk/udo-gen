<?php

namespace Pudo;

/**
 * Collects the optional form/table/card view overrides. Only declare a view
 * when overriding the default "all fields, declared order". Named arguments
 * keep call sites self-describing:
 *
 *   $views->form(fields: ['title', 'slug', 'status'], layout: 'two-column');
 *   $views->table(columns: ['title', ['field' => 'status', 'badge' => true]]);
 *   $views->card(title: 'title', subtitle: 'author.name');
 */
class Views
{
    private ?array $form = null;
    private ?array $table = null;
    private ?array $card = null;

    /**
     * @param list<string>|null $fields Field names in form order; omitted fields are excluded.
     * @param 'single-column'|'two-column'|null $layout
     */
    public function form(?array $fields = null, ?string $layout = null): void
    {
        $form = [];
        if ($fields !== null) $form['fields'] = array_values($fields);
        if ($layout !== null) $form['layout'] = $layout;
        $this->form = $form;
    }

    /**
     * @param list<string|array>|null $columns Field names (dotted paths allowed) or
     *        arrays like ['field' => 'rating', 'align' => 'right', 'sortable' => true].
     * @param list<string>|null $search
     */
    public function table(
        ?array $columns = null,
        ?array $search = null,
        ?string $defaultSort = null,
        ?int $pageSize = null,
    ): void {
        $table = [];
        if ($columns !== null) $table['columns'] = array_values($columns);
        if ($search !== null) $table['search'] = array_values($search);
        if ($defaultSort !== null) $table['defaultSort'] = $defaultSort;
        if ($pageSize !== null) $table['pageSize'] = $pageSize;
        $this->table = $table;
    }

    /**
     * @param list<string>|null $body Fields shown in the card body.
     */
    public function card(?string $title = null, ?string $subtitle = null, ?array $body = null): void
    {
        $card = [];
        if ($title !== null) $card['title'] = $title;
        if ($subtitle !== null) $card['subtitle'] = $subtitle;
        if ($body !== null) $card['body'] = array_values($body);
        $this->card = $card;
    }

    public function toArray(): array
    {
        $out = [];
        if ($this->form !== null) $out['form'] = $this->form;
        if ($this->table !== null) $out['table'] = $this->table;
        if ($this->card !== null) $out['card'] = $this->card;
        return $out;
    }
}
