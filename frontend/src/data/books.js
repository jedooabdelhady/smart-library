/**
 * قائمة كتب المكتبة الدينية الذكية
 * الكتب المفهرسة الحقيقية فقط
 */

const libraryBooks = [
  {
    id: 2,
    title: 'المغني',
    author: 'ابن قدامة - تحقيق التركي',
    category: 'hanbali_fiqh',
    category_name: 'الفقه الحنبلي',
    pages_count: 10896,
    indexed: true,
    description: 'من أعظم كتب الفقه الحنبلي المقارن، يعرض المذهب مع مقارنة المذاهب الأربعة',
  },
  {
    id: 4,
    title: 'الممتع في شرح المقنع',
    author: 'زين الدين المُنَجَّى',
    category: 'hanbali_fiqh',
    category_name: 'الفقه الحنبلي',
    pages_count: 3093,
    indexed: true,
    description: 'شرح متميز لكتاب المقنع لابن قدامة',
  },
  {
    id: 3,
    title: 'شرح الزركشي على مختصر الخرقي',
    author: 'الزركشي الحنبلي',
    category: 'hanbali_fiqh',
    category_name: 'الفقه الحنبلي',
    pages_count: 4336,
    indexed: true,
    description: 'شرح نفيس لمختصر الخرقي في الفقه الحنبلي',
  },
  {
    id: 5,
    title: 'الوجيز في الفقه على مذهب الإمام أحمد بن حنبل',
    author: 'الحسين بن يوسف الدجيلي',
    category: 'hanbali_fiqh',
    category_name: 'الفقه الحنبلي',
    pages_count: 590,
    indexed: true,
    description: 'مختصر في الفقه الحنبلي',
  },
  {
    id: 1,
    title: 'الروض المربع شرح زاد المستقنع',
    author: 'منصور بن يونس البهوتي',
    category: 'hanbali_fiqh',
    category_name: 'الفقه الحنبلي',
    pages_count: 737,
    indexed: true,
    description: 'من أشهر المتون الفقهية الحنبلية وشرحها',
  },
];

export default libraryBooks;
