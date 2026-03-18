import { useQuery } from "@tanstack/react-query";

export type AppCategory = "Tất cả" | "Công cụ" | "Giải trí" | "Năng suất" | "Tiện ích";

export interface AppItem {
  id: string;
  name: string;
  description: string;
  category: AppCategory;
  icon: string;
  url: string;
  featured?: boolean;
  colorClass: string;
}

const STATIC_APPS: AppItem[] = [
  {
    id: "app-1",
    name: "Trello Clone",
    description: "Quản lý công việc và dự án theo phương pháp Kanban dễ dàng.",
    category: "Năng suất",
    icon: "📋",
    url: "https://trello.com",
    featured: true,
    colorClass: "from-blue-500 to-cyan-400"
  },
  {
    id: "app-2",
    name: "Notion Board",
    description: "Ghi chú, tổ chức dữ liệu cá nhân và làm việc nhóm hiệu quả.",
    category: "Năng suất",
    icon: "📓",
    url: "https://notion.so",
    featured: true,
    colorClass: "from-stone-600 to-stone-400"
  },
  {
    id: "app-3",
    name: "Spotify Web",
    description: "Nghe nhạc trực tuyến với hàng triệu bài hát chất lượng cao.",
    category: "Giải trí",
    icon: "🎵",
    url: "https://open.spotify.com",
    featured: true,
    colorClass: "from-green-500 to-emerald-400"
  },
  {
    id: "app-4",
    name: "YouTube Mini",
    description: "Xem video, giải trí và học tập mỗi ngày qua màn ảnh nhỏ.",
    category: "Giải trí",
    icon: "📺",
    url: "https://youtube.com",
    colorClass: "from-red-500 to-rose-400"
  },
  {
    id: "app-5",
    name: "Figma Lite",
    description: "Thiết kế giao diện, UI/UX và tạo prototype nhanh chóng.",
    category: "Công cụ",
    icon: "🎨",
    url: "https://figma.com",
    featured: true,
    colorClass: "from-purple-500 to-pink-400"
  },
  {
    id: "app-6",
    name: "Canva Express",
    description: "Tạo các thiết kế đồ họa, bài đăng mạng xã hội dễ dàng.",
    category: "Công cụ",
    icon: "🖌️",
    url: "https://canva.com",
    colorClass: "from-cyan-500 to-blue-500"
  },
  {
    id: "app-7",
    name: "Máy tính (Calc)",
    description: "Công cụ tính toán nhanh gọn, hỗ trợ tính toán khoa học.",
    category: "Tiện ích",
    icon: "🧮",
    url: "#",
    colorClass: "from-orange-400 to-amber-500"
  },
  {
    id: "app-8",
    name: "Dịch thuật",
    description: "Dịch đa ngôn ngữ tức thì, hỗ trợ giọng nói và hình ảnh.",
    category: "Tiện ích",
    icon: "🌐",
    url: "https://translate.google.com",
    colorClass: "from-blue-600 to-indigo-500"
  },
  {
    id: "app-9",
    name: "Thời tiết (Weather)",
    description: "Dự báo thời tiết địa phương và cảnh báo khí hậu.",
    category: "Tiện ích",
    icon: "🌤️",
    url: "https://weather.com",
    colorClass: "from-sky-400 to-blue-400"
  },
  {
    id: "app-10",
    name: "Pomodoro Timer",
    description: "Tăng cường tập trung làm việc với kỹ thuật Pomodoro 25 phút.",
    category: "Năng suất",
    icon: "⏱️",
    url: "https://pomofocus.io",
    colorClass: "from-rose-500 to-orange-400"
  },
  {
    id: "app-11",
    name: "Ghi âm Online",
    description: "Thu âm giọng nói trực tiếp trên trình duyệt tiện lợi.",
    category: "Công cụ",
    icon: "🎙️",
    url: "#",
    colorClass: "from-violet-500 to-purple-400"
  },
  {
    id: "app-12",
    name: "Sudoku Web",
    description: "Trò chơi giải đố điền số rèn luyện trí não mỗi ngày.",
    category: "Giải trí",
    icon: "🧩",
    url: "#",
    colorClass: "from-indigo-500 to-cyan-400"
  }
];

export function useApps() {
  return useQuery({
    queryKey: ["apps"],
    queryFn: async () => {
      // Simulate network delay for a more realistic feel
      await new Promise((resolve) => setTimeout(resolve, 800));
      return STATIC_APPS;
    },
    // Data is completely static so we can cache it indefinitely
    staleTime: Infinity, 
  });
}
