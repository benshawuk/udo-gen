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
  factory?: 'auto' | false;
  nav?: UdoNav;
  fields: Record<string, UdoField>;
  relationships?: Record<string, UdoRelationship>;
  views?: {
    form?: UdoFormView;
    table?: UdoTableView;
    card?: UdoCardView;
  };
}
