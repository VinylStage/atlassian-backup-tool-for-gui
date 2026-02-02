export interface Space {
  id: string;
  name: string;
  key: string;
}

export interface Page {
  id: string;
  title: string;
  spaceId: string;
  parentId: string | null;
  parentType: 'space' | 'page';
  status: string;
  createdAt: string;
  body?: {
    storage?: {
      value: string;
    };
  };
}

export interface ConfluenceApiSpace {
  id: number;
  key: string;
  name: string;
  type: string;
  status: string;
}

export interface ConfluenceApiPage {
  id: string;
  title: string;
  spaceId: number;
  parentId?: number;
  parentType: string;
  status: string;
  createdAt: string;
  body?: {
    storage?: {
      value: string;
    };
  };
}

export interface ConfluenceSpacesResponse {
  results: ConfluenceApiSpace[];
  _links?: {
    next?: string;
  };
}

export interface ConfluencePagesResponse {
  results: ConfluenceApiPage[];
  _links?: {
    next?: string;
  };
}
