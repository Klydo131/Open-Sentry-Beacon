'use client';

// How an Office plan (a Sabbath program, evangelistic meetings) is posted for
// Explorers and taken down again, in a church's own app and in the sample
// church. One place, so the Office and This Sabbath behave the same.

import * as live from '@/lib/live/data';
import { useDemo } from '@/lib/demo/store';
import type { ShareInApp, TakeDown } from '@/components/SabbathProgram';

export const liveSharing: { share: ShareInApp; takeDown: TakeDown } = {
  share: (post) => live.createBlogPost({ ...post, visibility: 'published' }),
  takeDown: (ids, titles) => live.takeDownMySharedPosts(ids, titles),
};

/** The sample church's: the same, against the sample posts. */
export function useSampleSharing(): { share: ShareInApp; takeDown: TakeDown } {
  const { db, currentUser, addBlogPost, deleteBlogPost } = useDemo();
  return {
    share: async (post) => addBlogPost({ ...post, visibility: 'published' }),
    takeDown: async (ids, titles) => {
      if (!currentUser) return;
      for (const p of db.blog_posts) {
        if (p.author_id === currentUser.id && (ids.includes(p.id) || titles.includes(p.title))) deleteBlogPost(p.id);
      }
    },
  };
}
