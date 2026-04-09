import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PostsService } from './posts.service';
import { PublishGeneratedPostDto } from './dto/publish-generated-post.dto';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const post = await this.postsService.findById(id);

    return {
      item: post,
    };
  }

  @Post(':id/publish')
  async publish(@Param('id') id: string, @Body() dto: PublishGeneratedPostDto) {
    const result = await this.postsService.publish(id, dto.channelId);

    return {
      message: 'Publish job queued successfully',
      ...result,
    };
  }

  @Get(':id/publish-logs')
  async getPublishLogs(@Param('id') id: string) {
    const items = await this.postsService.getPublishLogs(id);

    return {
      items,
    };
  }
}
