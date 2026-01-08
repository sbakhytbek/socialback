
import { Controller, Get, Req } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { Request } from 'express';
import { saveBase64File } from 'src/posts/save-base64-file';
import { saveUrlToFile } from 'src/posts/save-url-file';

@Controller('accounts')
export class AccountsController {
 constructor(private readonly accountsService: AccountsService) {}

  @Get()
  async findAll(@Req() req: Request) {
    const accounts = await this.accountsService.getAccounts();

    const host = req.get('host') || req.headers.host;
    const protocol =
      (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';

    return Promise.all(
      accounts.map(async (acc) => {
        if (acc.profile_pic_url?.startsWith('http')) {
          try {
            const savedPath = await saveUrlToFile(
              acc.profile_pic_url,
              'accounts',
              `account_${acc.id}` // ❗ стабильное имя
            );

            return {
              ...acc,
              profile_pic_url: `${protocol}://${host}${savedPath}`,
            };
          } catch {
            return acc;
          }
        }
        return acc;
      })
    );
  }

}