// Shapes returned by the API to the client UI.

export interface ApiUser {
  id: string;
  name: string | null;
  email: string;
}

export interface ApiComment {
  id: string;
  body: string;
  status: string; // "open" | "resolved"
  createdAt: string;
  resolvedAt: string | null;
  author: ApiUser;
}

export interface ApiAnnotation {
  id: string;
  type: string; // pin3d | freehand | text | shape | measurement | pdf-markup
  severity: string; // low | medium | high | critical
  geometry: string; // JSON string
  cameraState: string | null; // JSON string
  page: number | null;
  createdAt: string;
  author: ApiUser;
  comments: ApiComment[];
}

export interface ApiActivity {
  id: string;
  type: string;
  payload: string | null;
  createdAt: string;
  actor: { name: string | null; email: string };
}

export interface ApiShare {
  id: string;
  invitedEmail: string;
  permission: string;
  createdAt: string;
}

export interface RevisionInfo {
  id: string;
  version: number;
  status: string;
  note: string | null;
  createdAt: string;
  uploaderEmail: string;
  viewable: { url: string; name: string } | null;
  pdfs: { url: string; name: string }[];
  attachments: { url: string; name: string }[];
}

export interface ProjectInfo {
  id: string;
  name: string;
  isOwner: boolean;
  permission: string; // owner | edit | comment | view
}
