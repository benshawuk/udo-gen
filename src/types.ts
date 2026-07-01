/**
 * TypeScript types mirroring the UDO v1 JSON Schema.
 * Kept in sync by hand for now; a future task will codegen these from the schema.
 */

export type PrimitiveType =
  | 'string'
  | 'text'
  | 'longText'
  | 'mediumText'
  | 'integer'
  | 'bigInteger'
  | 'tinyInteger'
  | 'unsignedInteger'
  | 'unsignedTinyInteger'
  | 'decimal'
  | 'float'
  | 'double'
  | 'boolean'
  | 'date'
  | 'dateTime'
  | 'timestamp'
  | 'time'
  | 'json'
  | 'uuid'
  | 'foreignId'
  | 'binary';

export type ControllerConfig =
  | 'auto'
  | 'custom'
  | {
      mode: 'auto';
      eagerLoad?: string[];
      scopes?: string[];
      defaultSort?: string;
      search?: string[];
      pageSize?: number;
      /**
       * FK column tying each row to auth()->id(). The generated controller
       * scopes index() to the owner, forces the column on store(), and 404s
       * show/update/destroy for non-owners. The column is excluded from the
       * FormRequest and from the TS Create/Update payloads.
       */
      ownedBy?: string;
    };

export interface UdoField {
  type: PrimitiveType;
  format?: string;
  required?: boolean;
  nullable?: boolean;
  unique?: boolean;
  index?: boolean;
  default?: string | number | boolean | null;
  max?: number;
  min?: number;
  length?: number;
  precision?: number;
  scale?: number;
  values?: (string | number)[];
  references?: string;
  onDelete?: 'cascade' | 'restrict' | 'set null' | 'no action';
  displayField?: string;
  label?: string;
  /** Exclude from API serialization (Laravel $hidden) + the read Shape. Still writable. */
  hidden?: boolean;
  /** Override the inferred Eloquent cast, e.g. 'hashed', 'encrypted', 'encrypted:array'. */
  cast?: string;
  validation?: {
    backend?: string[];
    frontend?: string[];
    skip?: { backend?: string[]; frontend?: string[] };
  };
  ui?: {
    widget?: string;
    help?: string;
    placeholder?: string;
    format?: string;
  };
}

export interface UdoRelationship {
  type: 'hasOne' | 'hasMany' | 'belongsToMany' | 'morphTo' | 'morphMany';
  model: string;
  foreignKey?: string;
  localKey?: string;
  pivot?: string;
  morphName?: string;
}

export interface UdoIndex {
  columns: string[];
  unique?: boolean;
  name?: string;
}

export interface UdoFormView {
  fields?: string[];
  layout?: 'single-column' | 'two-column';
}

export type UdoTableColumn =
  | string
  | {
      field: string;
      label?: string;
      sortable?: boolean;
      align?: 'left' | 'center' | 'right';
      badge?: boolean;
      format?: string;
    };

export interface UdoTableView {
  columns?: UdoTableColumn[];
  search?: string[];
  defaultSort?: string;
  pageSize?: number;
}

export interface UdoCardView {
  title?: string;
  subtitle?: string;
  body?: string[];
}

export interface UdoNav {
  section?: string;
  icon?: string;
  order?: number;
}

export interface UdoDocument {
  $schema?: string;
  udoVersion: 1;
  resource: string;
  table?: string;
  softDeletes?: boolean;
  timestamps?: boolean;
  indexes?: UdoIndex[];
  controller?: ControllerConfig;
  transformer?: 'auto' | 'custom';
  request?: 'auto' | 'custom';
  factory?: 'auto' | false;
  nav?: UdoNav;
  fields: Record<string, UdoField>;
  relationships?: Record<string, UdoRelationship>;
  /**
   * Computed accessor attributes appended to serialization (Laravel $appends).
   * Accessor bodies live in the model extension; the declared read-only type
   * flows to the API Resource and the frontend Shape.
   */
  appends?: Record<string, { type: PrimitiveType; nullable?: boolean }>;
  views?: {
    form?: UdoFormView;
    table?: UdoTableView;
    card?: UdoCardView;
  };
}
