import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { DbModule } from 'src/db/db.module';
import { QueueModule } from 'src/queue/queue.module';

@Module({
  imports: [DbModule, QueueModule],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
