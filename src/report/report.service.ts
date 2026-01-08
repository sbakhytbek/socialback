import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Comments } from 'src/comments/comments.entity';
import { CreateReportDto } from './dto/create-report.dto';

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(Comments)
    private readonly commentsRepo: Repository<Comments>,
  ) {}

  async generateReport(dto: CreateReportDto) {
    const moods = dto?.moods ?? [];
    const page = dto.page && dto.page > 0 ? dto.page : 1;
    const limit = dto.limit && dto.limit > 0 ? dto.limit : 100;
    const skip = (page - 1) * limit;

    // Создаем условия для WHERE
    const whereConditions: any = {};

    // Фильтр по настроениям (moods)
    if (moods.length > 0) {
      whereConditions.label = moods.length === 1 ? moods[0] : In(moods);
    }

    // Фильтр по социальным сетям (tip_social)
    if (dto.tip_social && dto.tip_social.length > 0) {
      whereConditions.tip_social = In(dto.tip_social);
    }

    const sphereId = Number(dto.sphere_id);

    // Фильтр по сфере (sphere_id - одиночный выбор)
   if (sphereId && sphereId !== 999) {
      whereConditions.category_id = sphereId;

    } else if (sphereId === 999) {
      whereConditions.category_id = In(
        Array.from({ length: 18 }, (_, i) => i + 1)
      );
    }

    // // Фильтр по сферам (spheres - множественный выбор)
    // if (dto.spheres && dto.spheres.length > 0) {
    //   whereConditions.category_id = In(dto.spheres);
    // }

    // Фильтр по дате начала
    if (dto.start_date) {
      const startDate = new Date(dto.start_date);
      whereConditions.created = MoreThanOrEqual(startDate);
    }

    // Фильтр по дате окончания
    if (dto.end_date) {
      const endDate = new Date(dto.end_date);
      // Если уже есть условие по дате начала, объединяем их
      if (whereConditions.created && whereConditions.created instanceof MoreThanOrEqual) {
        whereConditions.created = Between(
          whereConditions.created.value,
          endDate
        );
      } else {
        whereConditions.created = LessThanOrEqual(endDate);
      }
    }

    // Используем queryBuilder для JOIN с posts
  const queryBuilder = this.commentsRepo.createQueryBuilder('comment')
  .leftJoinAndSelect('comment.posts', 'posts')
  .where(whereConditions);

    // ✅ ФИЛЬТР ПО ДАТЕ
    if (dto.start_date && dto.end_date) {
      queryBuilder.andWhere(
        'comment.created BETWEEN :start AND :end',
        {
          start: new Date(dto.start_date),
          end: new Date(dto.end_date),
        }
      );
    } else if (dto.start_date) {
      queryBuilder.andWhere(
        'comment.created >= :start',
        { start: new Date(dto.start_date) }
      );
    } else if (dto.end_date) {
      queryBuilder.andWhere(
        'comment.created <= :end',
        { end: new Date(dto.end_date) }
      );
    }

    queryBuilder
      .orderBy('comment.created', 'DESC')
      .skip(skip)
      .take(limit);

    // Выполняем запрос
    const [data, total] = await queryBuilder.getManyAndCount();

    // Преобразуем данные для удобного использования на фронтенде
    const formattedData = data.map(comment => ({
      id: comment.id,
      text: comment.text,
      label: comment.label,
      likes: comment.likes,
      tip_social: comment.tip_social,
      created: comment.created,
      category_id: comment.category_id,
      is_read: comment.is_read,
      // Поля из связанного поста (через связь ManyToOne)
      post_url: comment.posts?.post_url,
      post_id: comment.posts?.id, // ID поста
    }));

    return {
      data: formattedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // Модифицируйте метод getUnreadComments в сервисе:
async getUnreadComments() {
  const unreadComments = await this.commentsRepo.createQueryBuilder('comment')
    .leftJoinAndSelect('comment.posts', 'posts')
    .where('comment.is_read = :isRead', { isRead: false })
    .orderBy('comment.created', 'DESC')
    .getMany();

  // Автоматически отмечаем все найденные комментарии как прочитанные
    if (unreadComments.length > 0) {
      const commentIds = unreadComments.map(comment => comment.id);
      
      await this.commentsRepo.createQueryBuilder()
        .update(Comments)
        .set({ is_read: true })
        .where('id IN (:...ids)', { ids: commentIds })
        .execute();
    }

    return unreadComments.map(comment => ({
      id: comment.id,
      text: comment.text,
      label: comment.label,
      likes: comment.likes,
      tip_social: comment.tip_social,
      created: comment.created,
      category_id: comment.category_id,
      is_read: true, // Теперь всегда true, так как мы их отметили
      post_url: comment.posts?.post_url,
      post_id: comment.posts?.id,
    }));
  }

  async getReadComments() {
    const unreadComments = await this.commentsRepo
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.posts', 'posts')
      // 🔹 фильтруем только непрочитанные
      .where('comment.is_read = :isRead', { isRead: false })
      .orderBy('comment.created', 'DESC')
      .getMany();

    return unreadComments.map(comment => ({
      id: comment.id,
      text: comment.text,
      label: comment.label,
      likes: comment.likes,
      tip_social: comment.tip_social,
      created: comment.created,
      category_id: comment.category_id,
      is_read: comment.is_read, // будет false
      post_url: comment.posts?.post_url,
      post_id: comment.posts?.id,
    }));
  }

  // ДОБАВЬТЕ ЭТОТ МЕТОД:
  async markAllUnreadAsRead(): Promise<{ success: boolean; markedCount: number }> {
    // Находим все непрочитанные комментарии
    const unreadComments = await this.commentsRepo.find({
      where: { is_read: false }
    });
    
    if (unreadComments.length === 0) {
      return { success: true, markedCount: 0 };
    }
    
    // Получаем их ID
    const commentIds = unreadComments.map(comment => comment.id);
    
    // Обновляем статус всех непрочитанных комментариев
    const result = await this.commentsRepo.createQueryBuilder()
      .update(Comments)
      .set({ is_read: true })
      .where('id IN (:...ids)', { ids: commentIds })
      .execute();
    
    return { 
      success: true, 
      markedCount: result.affected || 0 
    };
  }
}