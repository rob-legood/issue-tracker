import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import IssueListView from '@/views/IssueListView.vue';
import IssueCreateView from '@/views/IssueCreateView.vue';
import IssueDetailView from '@/views/IssueDetailView.vue';
import NotFoundView from '@/views/NotFoundView.vue';

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/issues' },
  { path: '/issues', name: 'issues', component: IssueListView },
  { path: '/issues/new', name: 'issue-new', component: IssueCreateView },
  { path: '/issues/:id', name: 'issue', component: IssueDetailView },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
