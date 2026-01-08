
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpException, Res, HttpStatus, Req } from '@nestjs/common';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import axios from 'axios';
import { Request, Response } from 'express';
import { saveBase64File } from './save-base64-file';
import { saveUrlToFile } from './save-url-file';


@Controller('posts')
export class PostsController {
 constructor(private readonly postsService: PostsService) {}

  @Post()
  create(@Body() createPostDto: CreatePostDto) {
    return this.postsService.create(createPostDto);
  }

  @Get()
  async findAll(
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('accountId') accountId: number,
  ) {
    // Проверяем accountId ДО выполнения запроса
    if (!accountId) {
      throw new HttpException('accountId is required', HttpStatus.BAD_REQUEST);
    }

    const [data, total] = await this.postsService.findAll(
      Number(page),
      Number(limit),
      Number(accountId),
    );

    const host = req.get('host') || req.headers.host;
    const protocol =
      (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';

    // ⚙️ Получаем аккаунт по ID
    const account = await this.postsService.getAccountById(Number(accountId));

    // 🔹 Сохраняем аватар аккаунта локально
    let accountProfilePicUrl: string | null = null;
    if (account?.profile_pic_url && account.profile_pic_url.startsWith('http')) {
      try {
        const saved = await saveUrlToFile(account.profile_pic_url, 'accounts', `account_${account.id}`);
        accountProfilePicUrl = `${protocol}://${host}${saved}`;
      } catch (error) {
        console.error('Failed to save account avatar:', error);
        accountProfilePicUrl = account.profile_pic_url; // Оставляем оригинальный URL
      }
    } else {
      accountProfilePicUrl = account?.profile_pic_url || null;
    }

    // 🔹 Формируем объект аккаунта
    const accountWithLocalPic = account
      ? {
          ...account,
          profile_pic_url: accountProfilePicUrl,
        }
      : null;

    // 🔹 Сохраняем изображения постов локально
    const updatedPosts = await Promise.all(
      data.map(async (post) => {
        if (post.image_url && post.image_url.startsWith('http')) {
          try {
            const saved = await saveUrlToFile(post.image_url, 'posts', `post_${post.id}`);
            post.image_url = `${protocol}://${host}${saved}`;
          } catch (error) {
            console.error(`Failed to save image for post ${post.id}:`, error);
            // Оставляем оригинальный URL в случае ошибки
          }
        }
        return post;
      }),
    );

    return {
      account: accountWithLocalPic,
      data: updatedPosts,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.postsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePostDto: UpdatePostDto) {
    return this.postsService.update(+id, updatePostDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.postsService.remove(+id);
  }

  @Get('proxy')
  async proxyImage(@Query('url') url: string, @Req() req: Request, @Res() res: Response) {
    if (!url) {
      throw new HttpException('url query parameter is required', HttpStatus.BAD_REQUEST);
    }

    const decoded = decodeURIComponent(url);
    
    // Проверяем, является ли строка base64
    if (decoded.startsWith('/9j/') || decoded.startsWith('iVBORw0KGgo') || 
        decoded.startsWith('data:image/') || decoded.length > 1000) {
      // Обработка base64 как раньше
      let base64Data = decoded;
      if (decoded.startsWith('data:image/')) {
        const matches = decoded.match(/^data:image\/\w+;base64,(.+)$/);
        if (matches && matches[1]) {
          base64Data = matches[1];
        }
      }
      
      let contentType = 'image/jpeg';
      if (decoded.startsWith('data:image/png')) {
        contentType = 'image/png';
      } else if (decoded.startsWith('data:image/gif')) {
        contentType = 'image/gif';
      } else if (decoded.startsWith('data:image/webp')) {
        contentType = 'image/webp';
      }
      
      res.setHeader('Content-Type', contentType);
      res.send(Buffer.from(base64Data, 'base64'));
      return;
    }

    // Для URL (особенно Instagram) используем специальные заголовки
    try {
      const headers: any = {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      };

      // Добавляем Referer для Instagram
      if (url.includes('instagram.') || url.includes('fbcdn.net')) {
        headers['Referer'] = 'https://www.instagram.com/';
        headers['Origin'] = 'https://www.instagram.com';
        
        // Пробуем обойти подпись URL, удаляя некоторые параметры
        try {
          const urlObj = new URL(url);
          // Удаляем параметры подписи которые могут быть просрочены
          const paramsToKeep = ['stp', 'efg', '_nc_ht', '_nc_cat', 'oh', 'oe'];
          const newParams = new URLSearchParams();
          
          urlObj.searchParams.forEach((value, key) => {
            if (paramsToKeep.includes(key) || key.startsWith('_nc_')) {
              newParams.append(key, value);
            }
          });
          
          urlObj.search = newParams.toString();
          url = urlObj.toString();
        } catch (e) {
          // Если не удалось разобрать URL, используем оригинальный
        }
      }

      const resp = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: headers,
        timeout: 15000,
        validateStatus: function (status) {
          return status >= 200 && status < 400; // Принимаем и редиректы
        },
        maxRedirects: 5
      });

      // Определяем Content-Type
      let contentType = resp.headers['content-type'] || 'image/jpeg';
      
      // Устанавливаем заголовки кэширования
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Кэш на 24 часа
      res.setHeader('Vary', 'Accept-Encoding');
      
      res.send(Buffer.from(resp.data));
    } catch (err) {
      console.error('Failed to fetch image:', err.message);
      
      // Если не удалось загрузить, отдаем placeholder изображение
      const placeholder = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        'base64'
      );
      
      res.setHeader('Content-Type', 'image/png');
      res.send(placeholder);
    }
  }
}
