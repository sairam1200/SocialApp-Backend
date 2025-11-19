export type QueryOptions = {
  page: number;
  pageSize: number;
  orderBy?: string;
  order?: 'ASC' | 'DESC';
  searchQuery?: string;
  filter?: Record<string, any>;
};

