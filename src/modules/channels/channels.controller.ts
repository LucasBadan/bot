import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { CreatePublisherChannelDto } from './dto/create-publisher-channel.dto';

@Controller('channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Post()
  async create(@Body() dto: CreatePublisherChannelDto) {
    const channel = await this.channelsService.create(dto);

    return {
      message: 'Channel created successfully',
      channel,
    };
  }

  @Get()
  async findAll() {
    const items = await this.channelsService.findAll();

    return { items };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const item = await this.channelsService.findById(id);

    return { item };
  }
}
