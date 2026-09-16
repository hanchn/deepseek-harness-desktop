/** Canonical category catalog shared by host cache, overlay, and the public site. */
export interface CategoryDef {
    id: string;
    name: string;
    nameEn: string;
    description: string;
}
export declare const CATEGORIES: CategoryDef[];
export declare function categoryById(id: string): CategoryDef | undefined;
//# sourceMappingURL=categories.d.ts.map