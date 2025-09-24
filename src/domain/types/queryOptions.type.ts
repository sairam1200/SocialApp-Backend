
export type QueryOptions = {
  page: number;
  pageSize: number;
  searchQuery?: string;
  orderBy?: string;
  order: "ASC" | "DESC";
  filter: Record<string, any>;
}